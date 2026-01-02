const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const axios = require('axios');

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMembers]
});

// ✅ YOUR ACTUAL CREDENTIALS
const BOT_TOKEN = 'MTQyNjU2NzA4MjczNjM1MzQwMA.GiMVse.soz7bRx-RePOgot1NcFKP4mAupPsTOSgaEGFh4';
const CLIENT_ID = '1426567082736353400';
const FIREBASE_URL = 'https://pls-donate-99-default-rtdb.europe-west1.firebasedatabase.app';
const FIREBASE_AUTH = '6GGHM51DWtcq0DfsvWaaK7Q3sDcXKorpmbk7u8sz';

// Define your role IDs
const ROLES = {
    '10M_DONATED': '1397200263663587368',
    '1M_DONATED': '1397200139742875669',  
    '100K_DONATED': '1397199669851066512',
};

// Store temporary verifications (use database in production)
const temporaryVerifications = new Map();

// Verification functions
async function saveVerification(discordId, robloxId, robloxUsername) {
    try {
        await axios.put(`${FIREBASE_URL}/verifications/${discordId}.json?auth=${FIREBASE_AUTH}`, {
            robloxId: robloxId,
            robloxUsername: robloxUsername,
            verifiedAt: new Date().toISOString()
        });
        return true;
    } catch (error) {
        console.error('Error saving verification:', error);
        return false;
    }
}

async function getVerification(discordId) {
    try {
        const response = await axios.get(`${FIREBASE_URL}/verifications/${discordId}.json?auth=${FIREBASE_AUTH}`);
        return response.data;
    } catch (error) {
        return null;
    }
}

async function verifyRobloxOwnership(discordUserId, robloxUsername) {
    try {
        const userIdResponse = await axios.post('https://users.roblox.com/v1/usernames/users', {
            usernames: [robloxUsername]
        });
        
        if (!userIdResponse.data.data || userIdResponse.data.data.length === 0) {
            return { success: false, error: 'Roblox user not found' };
        }
        
        const robloxUserId = userIdResponse.data.data[0].id;
        const verificationCode = `DISCORD-${discordUserId}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
        
        temporaryVerifications.set(discordUserId, {
            code: verificationCode,
            robloxUserId: robloxUserId,
            robloxUsername: robloxUsername,
            expiresAt: Date.now() + 10 * 60 * 1000 // 10 minutes
        });
        
        return {
            success: true,
            code: verificationCode,
            robloxUserId: robloxUserId,
            instructions: `Please put this code in your Roblox profile description:\n**${verificationCode}**\nThen click the verify button below.`
        };
        
    } catch (error) {
        console.error('Verification error:', error);
        return { success: false, error: 'Verification failed' };
    }
}

async function checkVerificationCode(discordUserId) {
    try {
        const verification = temporaryVerifications.get(discordUserId);
        if (!verification) {
            return { success: false, error: 'No verification in progress' };
        }
        
        if (Date.now() > verification.expiresAt) {
            temporaryVerifications.delete(discordUserId);
            return { success: false, error: 'Verification code expired' };
        }
        
        const profileResponse = await axios.get(`https://users.roblox.com/v1/users/${verification.robloxUserId}`);
        
        if (profileResponse.data && profileResponse.data.description) {
            const profileDescription = profileResponse.data.description;
            
            if (profileDescription.includes(verification.code)) {
                await saveVerification(discordUserId, verification.robloxUserId, verification.robloxUsername);
                temporaryVerifications.delete(discordUserId);
                
                return { 
                    success: true, 
                    message: '✅ Account verified successfully!',
                    robloxUserId: verification.robloxUserId,
                    robloxUsername: verification.robloxUsername
                };
            }
        }
        
        return { 
            success: false, 
            error: 'Verification code not found in profile description. Make sure you saved the changes!' 
        };
        
    } catch (error) {
        console.error('Check verification error:', error);
        return { success: false, error: 'Failed to check verification' };
    }
}

async function getUserIdFromUsername(username) {
    try {
        const response = await axios.post('https://users.roblox.com/v1/usernames/users', {
            usernames: [username]
        });
        
        if (response.data.data && response.data.data.length > 0) {
            return response.data.data[0].id;
        }
        return null;
    } catch (error) {
        console.error('Error fetching Roblox user ID:', error);
        return null;
    }
}

async function getUserData(userId) {
    try {
        const response = await axios.get(`${FIREBASE_URL}/${userId}.json?auth=${FIREBASE_AUTH}`);
        return response.data;
    } catch (error) {
        console.error('Error fetching user data:', error);
        return null;
    }
}

async function assignDonatedRole(interaction, donated) {
    try {
        const member = interaction.member;
        const roleIds = Object.values(ROLES);
        
        console.log('🔄 Starting role assignment for donated amount:', donated);
        
        for (const roleId of roleIds) {
            try {
                const role = await interaction.guild.roles.fetch(roleId);
                if (role && member.roles.cache.has(roleId)) {
                    console.log('Removing role:', role.name);
                    await member.roles.remove(roleId);
                }
            } catch (removeError) {
                console.log('Error removing role', roleId, ':', removeError.message);
            }
        }
        
        let assignedRole = null;
        
        if (donated >= 10000000) {
            assignedRole = ROLES['10M_DONATED'];
            console.log('Qualifies for 10M+ role');
        } else if (donated >= 1000000) {
            assignedRole = ROLES['1M_DONATED'];
            console.log('Qualifies for 1M+ role');
        } else if (donated >= 100000) {
            assignedRole = ROLES['100K_DONATED'];
            console.log('Qualifies for 100K+ role');
        } else {
            console.log('No role qualified');
            return 'No Role';
        }
        
        if (assignedRole) {
            console.log('Attempting to assign role ID:', assignedRole);
            const role = await interaction.guild.roles.fetch(assignedRole);
            
            if (role) {
                console.log('Found role:', role.name);
                await member.roles.add(assignedRole);
                console.log('Successfully assigned role:', role.name);
                return role.name;
            } else {
                console.log('Role not found with ID:', assignedRole);
                return 'Role Not Found';
            }
        }
        
        return 'No Role';
    } catch (error) {
        console.error('Error in assignDonatedRole:', error);
        return 'Error assigning role: ' + error.message;
    }
}

// Slash commands - KEEP USERNAME AS REQUIRED
const commands = [
    new SlashCommandBuilder()
        .setName('donated')
        .setDescription('Check your donated amount and get your donated role')
        .addStringOption(option =>
            option.setName('roblox_username')
                .setDescription('Your Roblox username')
                .setRequired(true)
        ),
    
    new SlashCommandBuilder()
        .setName('viewstats')
        .setDescription('View all your stats from PLS DONATE 99')
        .addStringOption(option =>
            option.setName('roblox_username')
                .setDescription('Your Roblox username')
                .setRequired(true)
        ),
    
    new SlashCommandBuilder()
        .setName('verify')
        .setDescription('Link your Roblox account to Discord')
        .addStringOption(option =>
            option.setName('roblox_username')
                .setDescription('Your Roblox username')
                .setRequired(true)
        )
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);

// Handle commands
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options, user } = interaction;

    if (commandName === 'verify') {
        await interaction.deferReply({ ephemeral: true });
        
        const robloxUsername = options.getString('roblox_username').trim();
        const verification = await verifyRobloxOwnership(user.id, robloxUsername);
        
        if (!verification.success) {
            return await interaction.editReply(`❌ ${verification.error}`);
        }
        
        const embed = new EmbedBuilder()
            .setTitle('Verify Roblox Account')
            .setDescription(verification.instructions)
            .addFields(
                { name: 'Username', value: robloxUsername, inline: true },
                { name: 'Code', value: `\`${verification.code}\``, inline: true },
                { name: 'Expires', value: '<t:' + Math.floor((Date.now() + 10 * 60 * 1000) / 1000) + ':R>', inline: true }
            )
            .setColor(0x5865F2);
        
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('verify_check')
                    .setLabel('I Added the Code - Verify')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('verify_cancel')
                    .setLabel('Cancel')
                    .setStyle(ButtonStyle.Danger)
            );
        
        await interaction.editReply({ 
            embeds: [embed], 
            components: [row] 
        });
        return;
    }

    if (commandName === 'donated' || commandName === 'viewstats') {
        await interaction.deferReply();
        
        // CHECK IF USER IS VERIFIED - BLOCK COMMAND IF NOT
        const verification = await getVerification(user.id);
        
        if (!verification) {
            return await interaction.editReply(
                '❌ **Verification Required**\n\n' +
                'You must verify your Roblox account before using this command!\n' +
                '**Use:** `/verify [your_roblox_username]`\n\n' +
                '*This ensures account security and prevents unauthorized access.*'
            );
        }
        
        // USER IS VERIFIED - PROCEED WITH ORIGINAL COMMAND LOGIC
        const robloxUsername = options.getString('roblox_username').trim();
        
        if (!robloxUsername || robloxUsername.length < 3 || robloxUsername.length > 20) {
            return await interaction.editReply('❌ Please provide a valid Roblox username');
        }

        try {
            const userId = await getUserIdFromUsername(robloxUsername);
            
            if (!userId) {
                return await interaction.editReply('❌ Roblox user not found. Please check the username and try again.');
            }

            const userData = await getUserData(userId);
            
            if (!userData) {
                return await interaction.editReply('❌ User data not found. Make sure you have played PLS DONATE 99 and the username is correct.');
            }

            const raised = userData.Raised || userData.raised || userData.raisedAmount || userData.totalRaised || 0;
            const donated = userData.Donated || userData.donated || userData.donatedAmount || userData.totalDonated || 0;
            const giftbux = userData.Giftbux || userData.giftbux || userData.giftBux || userData.giftbuxAmount || 0;
            const robux = userData.Robux || userData.robux || userData.robuxAmount || userData.totalRobux || 0;

            // Create clickable Roblox profile link
            const robloxProfileLink = `https://www.roblox.com/users/${userId}/profile`;
            const clickableUsername = `[@${robloxUsername}](${robloxProfileLink})`;

            if (commandName === 'donated') {
                // Assign the actual Discord role
                const assignedRoleName = await assignDonatedRole(interaction, donated);
                
                // Create role mention for the embed field
                let roleDisplay = '*Below Requirements*';
                if (assignedRoleName !== 'No Role') {
                    if (donated >= 10000000) {
                        roleDisplay = '<@&1397200263663587368>';
                    } else if (donated >= 1000000) {
                        roleDisplay = '<@&1397200139742875669>';
                    } else if (donated >= 100000) {
                        roleDisplay = '<@&1397199669851066512>';
                    }
                }
                
                const embed = new EmbedBuilder()
                    .setTitle('PLS DONATE 99 - Donated')
                    .setDescription(`**Username:** ${clickableUsername}`)
                    .addFields(
                        { name: 'Donated', value: `**<:robuxOk:1428459671341240412> ${donated.toLocaleString()}**`, inline: true },
                        { name: 'Role Deserved', value: roleDisplay, inline: true }
                    )
                    .setColor(0x00FF00)
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });
            } else {
                const embed = new EmbedBuilder()
                    .setTitle('PLS DONATE 99 - Stats')
                    .setDescription(`**Username:** ${clickableUsername}`)
                    .addFields(
                        { name: 'Raised', value: `**<:robuxOk:1428459671341240412> ${raised.toLocaleString()}**`, inline: true },
                        { name: 'Donated', value: `**<:robuxOk:1428459671341240412> ${donated.toLocaleString()}**`, inline: true },
                        { name: 'Giftbux', value: `**<:giftbux:1400851141218013311> ${giftbux.toLocaleString()}**`, inline: true },
                        { name: 'Robux', value: `**<:robuxOk:1428459671341240412> ${robux.toLocaleString()}**`, inline: true }
                    )
                    .setColor(0x0099FF)
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });
            }

        } catch (error) {
            console.error('Error in command:', error);
            await interaction.editReply('❌ An error occurred while fetching your data. Please try again later.');
        }
    }
});

// Handle verification button clicks
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;
    
    if (interaction.customId === 'verify_check') {
        await interaction.deferReply({ ephemeral: true });
        
        const result = await checkVerificationCode(interaction.user.id);
        
        if (result.success) {
            const successEmbed = new EmbedBuilder()
                .setTitle('✅ Verification Successful!')
                .setDescription(`Your Discord account is now linked to **${result.robloxUsername}**`)
                .setColor(0x00FF00);
            
            await interaction.editReply({ 
                embeds: [successEmbed],
                components: [] 
            });
        } else {
            await interaction.editReply(`❌ ${result.error}`);
        }
    }
    
    if (interaction.customId === 'verify_cancel') {
        temporaryVerifications.delete(interaction.user.id);
        await interaction.update({ 
            content: '❌ Verification cancelled.',
            embeds: [],
            components: [] 
        });
    }
});

// Bot ready
client.once('ready', () => {
    console.log(`✅ Discord bot logged in as ${client.user.tag}`);
    
    rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands })
        .then(() => console.log('✅ Slash commands registered!'))
        .catch(console.error);
});

// Start bot
client.login(BOT_TOKEN);