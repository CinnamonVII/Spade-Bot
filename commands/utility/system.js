const { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('system')
        .setDescription('System management commands')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(sub =>
            sub.setName('restart').setDescription('Restart the bot process')
        )
        .addSubcommand(sub =>
            sub.setName('logs').setDescription('Get bot system logs')
        )
        .addSubcommand(sub =>
            sub.setName('reload').setDescription('Reload commands or redeploy')
                .addStringOption(option =>
                    option.setName('type')
                        .setDescription('What to reload')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Command Files (Hot Reload)', value: 'commands' },
                            { name: 'Deploy (Register Slash)', value: 'deploy' },
                            { name: 'All (Full Refresh)', value: 'all' }
                        )
                )
        ),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();

        if (sub === 'restart') {
            await interaction.reply({ content: '🔄 Restarting bot... The bot will be back online shortly!', ephemeral: true });

            // Graceful shutdown with cleanup
            setTimeout(async () => {
                try {
                    console.log('[System] Restart command initiated');

                    // Destroy Discord client
                    if (interaction.client) {
                        await interaction.client.destroy();
                    }

                    // Close database connections
                    const { pool } = require('../../database');
                    if (pool) {
                        await pool.end();
                        console.log('[System] Database connections closed');
                    }

                    console.log('[System] Graceful shutdown complete, exiting...');
                    process.exit(0); // PM2, Docker, or systemd will restart the bot
                } catch (error) {
                    console.error('[System] Error during restart:', error);
                    process.exit(1);
                }
            }, 1000); // Give time for the reply to send
        }

        if (sub === 'logs') {
            await interaction.deferReply({ ephemeral: true });

            const logPath = path.resolve(__dirname, '../../bot.log'); // Assuming root
            if (fs.existsSync(logPath)) {
                // Read last 50 lines maybe? Or just send file
                const attachment = new AttachmentBuilder(logPath, { name: 'bot.log' });
                return interaction.editReply({ content: 'Here are the system logs:', files: [attachment] });
            } else {
                return interaction.editReply({ content: '❌ No log file found.' });
            }
        }

        if (sub === 'reload') {
            await interaction.deferReply({ ephemeral: true });
            const type = interaction.options.getString('type') || 'commands';

            try {
                if (type === 'commands' || type === 'all') {
                    // Reload command files
                    const commandsPath = path.resolve(__dirname, '..');
                    const commandFolders = fs.readdirSync(commandsPath);
                    let count = 0;

                    for (const folder of commandFolders) {
                        const commandsPath2 = path.join(commandsPath, folder);
                        if (!fs.lstatSync(commandsPath2).isDirectory()) continue;

                        const commandFiles = fs.readdirSync(commandsPath2).filter(file => file.endsWith('.js'));
                        for (const file of commandFiles) {
                            const filePath = path.join(commandsPath2, file);
                            delete require.cache[require.resolve(filePath)];

                            try {
                                const newCommand = require(filePath);
                                if ('data' in newCommand && 'execute' in newCommand) {
                                    interaction.client.commands.set(newCommand.data.name, newCommand);
                                    count++;
                                }
                            } catch (e) {
                                console.error(`Error reloading ${file}:`, e);
                            }
                        }
                    }
                    await interaction.editReply(`✅ Reloaded ${count} command files.`);
                }

                if (type === 'deploy' || type === 'all') {
                    // Re-deploy slash commands
                    // SECURITY FIX: Using execFile() to prevent command injection
                    const { execFile } = require('child_process');
                    const deployScript = path.resolve(__dirname, '../../deploy-commands.js');

                    execFile('node', [deployScript], {
                        cwd: path.resolve(__dirname, '../../'),
                        timeout: 30000, // 30s timeout
                        shell: false // SECURITY: Explicitly disable shell
                    }, (error, stdout, stderr) => {
                        if (error) {
                            console.error('[System] Deploy error:', error);
                            interaction.followUp({ content: `❌ Deploy failed. Check server logs.`, ephemeral: true });
                            return;
                        }
                        interaction.followUp({ content: `✅ Slash commands re-deployed.\n\`\`\`${stdout.slice(0, 1000)}\`\`\``, ephemeral: true });
                    });
                }

            } catch (error) {
                console.error(error);
                await interaction.editReply(`❌ Error during reload: ${error.message}`);
            }
        }
    }
};
