

const requiredEnvVars = [
    { name: 'DISCORD_TOKEN', description: 'Discord Bot Token', validator: (val) => val.length > 50 },
    { name: 'CLIENT_ID', description: 'Discord Application Client ID', validator: (val) => /^\d+$/.test(val) },
];

const optionalEnvVars = [
    { name: 'CHANNEL_ID', description: 'Discord Channel ID for notifications', default: '' },
    { name: 'MC_HOST', description: 'Minecraft Server Host', default: '' },
    { name: 'MC_PORT', description: 'Minecraft Server Port', default: '' },
    { name: 'MC_USERNAME', description: 'Bot Username (optional)', default: 'BridgeBot' },
    { name: 'MC_VERSION', description: 'Minecraft Version (optional)', default: '1.20.1' },
    { name: 'ATERNOS_USER', description: 'Aternos Email (optional - currently non-functional)', default: '' },
    { name: 'ATERNOS_PASS', description: 'Aternos Password (optional - currently non-functional)', default: '' },
    { name: 'LOG_LEVEL', description: 'Logging level (info, warn, error, debug)', default: 'info' },
];


function validateEnvironment() {
    const errors = [];
    const warnings = [];


    for (const envVar of requiredEnvVars) {
        const value = process.env[envVar.name];

        if (!value) {
            errors.push(`❌ Missing required environment variable: ${envVar.name} (${envVar.description})`);
        } else if (envVar.validator && !envVar.validator(value)) {
            errors.push(`❌ Invalid format for ${envVar.name}: ${envVar.description}`);
        }
    }


    for (const envVar of optionalEnvVars) {
        if (!process.env[envVar.name]) {
            process.env[envVar.name] = envVar.default;
            if (envVar.default === '') {
                warnings.push(`⚠️  Optional variable ${envVar.name} not set: ${envVar.description}`);
            }
        }
    }


    if (errors.length > 0) {
        console.warn('\n' + '='.repeat(80));
        console.warn('CONFIGURATION ERRORS:');
        console.warn('='.repeat(80));
        errors.forEach(err => console.warn(err));
        console.warn('='.repeat(80) + '\n');
        throw new Error('Missing or invalid required environment variables.');
    }

    if (warnings.length > 0) {
        console.warn('\n' + '='.repeat(80));
        console.warn('CONFIGURATION WARNINGS:');
        console.warn('='.repeat(80));
        warnings.forEach(warn => console.warn(warn));
        console.warn('='.repeat(80) + '\n');
    }

    console.log('✅ Environment validation passed');
}

module.exports = { validateEnvironment };
