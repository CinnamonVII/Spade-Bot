const fs = require('node:fs');
const path = require('node:path');

module.exports = (client) => {
    const commandsPath = path.join(__dirname, '../../commands');

    function loadCommands(dir) {
         
        if (!fs.existsSync(dir)) return;

        const files = fs.readdirSync(dir);

        for (const file of files) {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);

            if (stat.isDirectory()) {
                loadCommands(filePath);
            } else if (file.endsWith('.js')) {
                try {
                    const command = require(filePath);
                    if ('data' in command && 'execute' in command) {
                        client.commands.set(command.data.name, command);
                    }
                } catch (error) {
                    console.error('[CommandLoad] Failed to load:', filePath, error);
                }
            }
        }
    }

    loadCommands(commandsPath);
};
