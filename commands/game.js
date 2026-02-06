const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('game')
        .setDescription('Play a minigame')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('What do you want to play?')
                .setRequired(true)
                .addChoices(
                    { name: 'Tic-Tac-Toe', value: 'tictactoe' }
                )),
    async execute(interaction) {
        const gameType = interaction.options.getString('type');

        if (gameType === 'tictactoe') {
            await startTicTacToe(interaction);
        }
    },
};

async function startTicTacToe(interaction) {
    
    let turn = 'X'; 
    const board = Array(9).fill(null);
    let gameOver = false;

    
    const getComponents = (disabled = false) => {
        const rows = [];
        for (let i = 0; i < 3; i++) {
            const row = new ActionRowBuilder();
            for (let j = 0; j < 3; j++) {
                const index = i * 3 + j;
                const btn = new ButtonBuilder()
                    .setCustomId(`ttt_${index}`)
                    .setLabel(board[index] || '⬜')
                    .setStyle(board[index] === 'X' ? ButtonStyle.Danger : board[index] === 'O' ? ButtonStyle.Success : ButtonStyle.Secondary)
                    .setDisabled(disabled || board[index] !== null);
                row.addComponents(btn);
            }
            rows.push(row);
        }
        return rows;
    };

    const response = await interaction.reply({
        content: `Tic-Tac-Toe started! Turn: **${turn}**`,
        components: getComponents(),
        fetchReply: true
    });

    const collector = response.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 * 5 }); 

    collector.on('collect', async i => {
        
        const index = parseInt(i.customId.split('_')[1]);

        if (board[index] !== null || gameOver) {
            await i.deferUpdate();
            return;
        }

        
        board[index] = turn;

        
        const winner = checkWin(board);
        if (winner) {
            gameOver = true;
            await i.update({
                content: `**${winner}** won!`,
                components: getComponents(true)
            });
            collector.stop();
            return;
        }

        
        if (board.every(cell => cell !== null)) {
            gameOver = true;
            await i.update({
                content: `It's a draw!`,
                components: getComponents(true)
            });
            collector.stop();
            return;
        }

        
        turn = turn === 'X' ? 'O' : 'X';
        await i.update({
            content: `Turn: **${turn}**`,
            components: getComponents()
        });
    });

    collector.on('end', collected => {
        if (!gameOver) {
            
            
            interaction.editReply({ content: "Game timed out.", components: getComponents(true) }).catch(() => { });
        }
    });
}

function checkWin(board) {
    const lines = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8], 
        [0, 3, 6], [1, 4, 7], [2, 5, 8], 
        [0, 4, 8], [2, 4, 6]             
    ];

    for (const [a, b, c] of lines) {
        if (board[a] && board[a] === board[b] && board[a] === board[c]) {
            return board[a];
        }
    }
    return null;
}
