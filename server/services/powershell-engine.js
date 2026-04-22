const { spawn } = require('child_process');
const path = require('path');

const POWERSHELL_SCRIPTS_DIR = path.join(__dirname, '..', 'powershell');
const DEFAULT_TIMEOUT = 60000; // 60 seconds

/**
 * Execute a PowerShell script with parameters
 * @param {string} scriptName - Name of the script file
 * @param {object} params - Parameters to pass to the script
 * @param {object} options - Execution options
 * @returns {Promise<object>} - Parsed JSON result
 */
async function executeScript(scriptName, params = {}, options = {}) {
    const scriptPath = path.join(POWERSHELL_SCRIPTS_DIR, scriptName);
    const timeout = options.timeout || DEFAULT_TIMEOUT;

    // Build parameter string
    const paramString = Object.entries(params)
        .map(([key, value]) => {
            if (typeof value === 'boolean') {
                return value ? `-${key}` : '';
            }
            if (Array.isArray(value)) {
                // Convert array to PowerShell array syntax
                const items = value.map(v => `'${String(v).replace(/'/g, "''")}'`).join(',');
                return `-${key} @(${items})`;
            }
            if (typeof value === 'string') {
                // Escape quotes in string values
                const escaped = value.replace(/"/g, '`"');
                return `-${key} "${escaped}"`;
            }
            return `-${key} ${value}`;
        })
        .filter(Boolean)
        .join(' ');

    const command = `& "${scriptPath}" ${paramString}`;

    return new Promise((resolve, reject) => {
        const ps = spawn('powershell.exe', [
            '-NoProfile',
            '-NonInteractive',
            '-ExecutionPolicy', 'Bypass',
            '-Command', command
        ], {
            windowsHide: true
        });

        let stdout = '';
        let stderr = '';

        ps.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        ps.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        const timeoutId = setTimeout(() => {
            ps.kill();
            reject(new Error(`Script execution timed out after ${timeout}ms`));
        }, timeout);

        ps.on('close', (code) => {
            clearTimeout(timeoutId);

            if (code !== 0 && !stdout.trim()) {
                reject(new Error(`Script exited with code ${code}: ${stderr}`));
                return;
            }

            try {
                // Try to parse as JSON
                const result = JSON.parse(stdout.trim());
                resolve(result);
            } catch {
                // If not JSON, return raw output
                resolve({
                    success: code === 0,
                    output: stdout.trim(),
                    error: stderr.trim() || null,
                    exitCode: code
                });
            }
        });

        ps.on('error', (err) => {
            clearTimeout(timeoutId);
            reject(err);
        });
    });
}

/**
 * Execute a PowerShell command directly
 * @param {string} command - PowerShell command to execute
 * @param {object} options - Execution options
 * @returns {Promise<object>} - Result object
 */
async function executeCommand(command, options = {}) {
    const timeout = options.timeout || DEFAULT_TIMEOUT;

    // Convert to base64 for reliable multi-line and escaping via -EncodedCommand
    const commandBuffer = Buffer.from(command, 'utf16le');
    const base64Command = commandBuffer.toString('base64');

    return new Promise((resolve, reject) => {
        const ps = spawn('powershell.exe', [
            '-NoProfile',
            '-NonInteractive',
            '-ExecutionPolicy', 'Bypass',
            '-EncodedCommand', base64Command
        ], {
            windowsHide: true
        });

        let stdout = '';
        let stderr = '';

        ps.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        ps.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        const timeoutId = setTimeout(() => {
            ps.kill();
            reject(new Error(`Command execution timed out after ${timeout}ms`));
        }, timeout);

        ps.on('close', (code) => {
            clearTimeout(timeoutId);

            try {
                const result = JSON.parse(stdout.trim());
                resolve(result);
            } catch {
                resolve({
                    success: code === 0,
                    output: stdout.trim(),
                    error: stderr.trim() || null,
                    exitCode: code
                });
            }
        });

        ps.on('error', (err) => {
            clearTimeout(timeoutId);
            reject(err);
        });
    });
}

/**
 * Execute a remote PowerShell script via WinRM
 * @param {object} node - The node object from database
 * @param {object} credentials - Username, password, domain
 * @param {string} scriptName - Script to execute
 * @param {object} params - Script parameters
 * @returns {Promise<object>} - Result
 */
async function executeRemoteScript(targetHost, credentials, scriptName, params = {}, node = {}) {
    const scriptPath = path.join(POWERSHELL_SCRIPTS_DIR, scriptName);
    const scriptContent = require('fs').readFileSync(scriptPath, 'utf8');

    // Build credential object
    const credCommand = credentials.domain
        ? `$cred = New-Object System.Management.Automation.PSCredential("${credentials.domain}\\${credentials.username}", (ConvertTo-SecureString "${credentials.password}" -AsPlainText -Force))`
        : `$cred = New-Object System.Management.Automation.PSCredential("${credentials.username}", (ConvertTo-SecureString "${credentials.password}" -AsPlainText -Force))`;

    // Build parameter hashtable for splatting
    const paramEntries = Object.entries(params).map(([key, value]) => {
        if (Array.isArray(value)) {
            const items = value.map(v => `'${String(v).replace(/'/g, "''")}'`).join(',');
            return `${key} = @(${items})`;
        }
        if (typeof value === 'string') {
            return `${key} = '${value.replace(/'/g, "''")}'`;
        }
        if (typeof value === 'boolean') {
            return `${key} = $${value}`;
        }
        return `${key} = ${value}`;
    }).join('; ');

    const findBestIp = (node) => {
        if (node.ipAddress && node.ipAddress !== '') return node.ipAddress;
        if (node.metrics?.network?.adapters?.length > 0) {
            // Find first non-empty IP
            const adapterWithIp = node.metrics.network.adapters.find(a => a.ip && a.ip !== '');
            if (adapterWithIp) return adapterWithIp.ip;
        }
        return null;
    };

    const targetIp = findBestIp(node);
    const primaryHost = targetHost || targetIp;

    const getSubCommand = (host) => `
        ${credCommand}
        $sessionOption = New-PSSessionOption -OperationTimeout 30000 -OpenTimeout 30000
        try {
            $session = New-PSSession -ComputerName "${host}" -Credential $cred -SessionOption $sessionOption -ErrorAction Stop
        } catch {
            Write-Error "Failed to connect to ${host}: $($_.Exception.Message)"
            throw
        }
        try {
            Invoke-Command -Session $session -ScriptBlock {
                param($ScriptContent, $Parameters)
                $scriptBlock = [ScriptBlock]::Create($ScriptContent)
                & $scriptBlock @Parameters
            } -ArgumentList @'
${scriptContent}
'@, @{${paramEntries}}
        } finally {
            if ($session) { Remove-PSSession $session -ErrorAction SilentlyContinue }
        }
    `;

    // Try primary host
    let result;
    try {
        console.log(`Executing remote script ${scriptName} on ${primaryHost}...`);
        result = await executeCommand(getSubCommand(primaryHost), { timeout: 60000 });
        if (result.success) {
            console.log(`Successfully executed ${scriptName} on ${primaryHost}`);
        } else {
            console.log(`Failed to execute ${scriptName} on ${primaryHost}: ${result.error || 'Unknown error'}`);
        }
    } catch (e) {
        console.log(`Exception executing ${scriptName} on ${primaryHost}: ${e.message}`);
        result = { success: false, error: e.message };
    }
    
    // Check for name resolution errors or explicit connection failures in the output
    const errText = (result.error || '') + (result.output || '');
    const isResolutionError = !result.success || 
        errText.includes('name cannot be resolved') || 
        errText.includes('ComputerNotFound') || 
        errText.includes('Failed to connect');

    // Trigger fallback if we have an IP and the primary failed or primary was hostname
    if (isResolutionError && targetIp && primaryHost !== targetIp) {
        console.log(`Connection failed for ${primaryHost}, trying fallback IP ${targetIp}...`);
        try {
            result = await executeCommand(getSubCommand(targetIp), { timeout: 60000 });
        } catch (e) {
            result = { success: false, error: e.message };
        }
    }
    
    // Clean up CLIXML if present in the error string to make it readable in the UI
    if (result.error && result.error.includes('#< CLIXML')) {
        result.error = result.error.replace(/<Objs[\s\S]*<\/Objs>/g, '')
                                   .replace(/_x000D__x000A_/g, '\n')
                                   .replace(/#< CLIXML/g, '')
                                   .trim();
        // If we cleaned it and it's empty but result failed, put a readable summary
        if (!result.error && !result.success) {
            result.error = "Remote connection failed (Name Resolution/DNS Error). Ensure the student PC is on and reachable.";
        }
    }
    
    return result;
}




/**
 * Test WinRM connectivity to a target
 * @param {string} targetHost - Target PC hostname or IP
 * @param {object} credentials - Username, password, domain
 * @returns {Promise<boolean>} - Connection success
 */
async function testConnection(targetHost, credentials) {
    try {
        const credCommand = credentials.domain
            ? `$cred = New-Object System.Management.Automation.PSCredential("${credentials.domain}\\${credentials.username}", (ConvertTo-SecureString "${credentials.password}" -AsPlainText -Force))`
            : `$cred = New-Object System.Management.Automation.PSCredential("${credentials.username}", (ConvertTo-SecureString "${credentials.password}" -AsPlainText -Force))`;

        const command = `
            ${credCommand}
            $result = Test-WSMan -ComputerName "${targetHost}" -Credential $cred -ErrorAction Stop
            @{ success = $true; message = "Connection successful" } | ConvertTo-Json
        `;

        const result = await executeCommand(command, { timeout: 30000 });
        return result.success === true;
    } catch {
        return false;
    }
}

module.exports = {
    executeScript,
    executeCommand,
    executeRemoteScript,
    testConnection
};
