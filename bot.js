//Coded by: Alexander Erickson
//Date: 06/01/21
//Version 1.0.0

//Notes: This bot has not been tested for use on more than one server.

require('dotenv').config();
const { Client, RichPresenceAssets } = require('discord.js');
const { Console } = require('winston/lib/winston/transports');

//Initialize bot
const bot = new Client();
bot.on('ready', () => {
    console.log(`${bot.user.username} has logged in`)
});

//used to track invites and the roles associated with the invites to allow new users to have their roles automatically added.
let clientInvites = [];
let roleArr = [];
let pmInvites = [];

let pmChatChannelName = 'pm-chatroom';

/**
 * 
 * @param {the server the role is created in} server 
 * @param {the name for the new role being created} roleName 
 * @returns {a promise of the new role created}
 */
function createRole(server, roleName){
    return server.roles.create({
        data: {
            name: roleName,
        },
    })
};

/**
 * 
 * @param {the server the channel is being created in} server 
 * @param {the name of the new channel} channelName 
 * @param {the role that can view the channel} channelRole
 * @param {the folder of the channel if desired, default undefined gives channel no parent/folder} channelFolder 
 * @returns {a promise of the newly created channel}
 */
function createChannel(server, channelName, channelRole, channelFolder = undefined){
    if(channelFolder !== undefined){
        return server.channels.create(channelName, {
            type: 'text',
            parent: channelFolder,
        });
    }else{
        return server.channels.create(channelName, {
            type: 'text',
            permissionOverwrites: [
                {
                    id: channelRole.id,
                    allow: ['VIEW_CHANNEL', 'SEND_MESSAGES']
                },
                {
                    id: server.roles.everyone.id,
                    deny: ['VIEW_CHANNEL', 'SEND_MESSAGES']
                },
            ],
        });
    }
};

/**
 * 
 * @param {the server the channel is being created in} server 
 * @param {the name of the new folder being created} pmName 
 * @returns {a promise of a newly created folder}
 */
function createFolder(server, pmName){
    return server.channels.create(pmName, {
        type: 'category',
        permissionOverwrites: [
            {
                id: server.roles.everyone.id,
                deny:['VIEW_CHANNEL', 'SEND_MESSAGES']
            },
        ]
    });
};


/**
 * 
 * @param {channel or category the invite is created for} channel 
 * @param {how long the invitation should last in hours} duration 
 * @param {how many times the invite can be used} uses 
 * @returns {a promise of the new invite created}
 */
function createChannelInvite(channel, duration, uses){
    return channel.createInvite({
        maxAge: duration*60*60,
        maxUses: uses
    });
};

function findInvite(inviteArr){
    console.log('finding invite');
    return new Promise((resolve, reject) => {
        let invReturn = {
            inv: undefined, 
            client: false, 
            pm: false
        };
        console.log(inviteArr);
        console.log(clientInvites);
        for(cInv in clientInvites){
            let foundInvite = inviteArr.find(i => cInv.id === i.id);
            if(foundInvite === undefined || cInv.uses < foundInvite.uses){ // === undefined because only links that are used will not be in the arr.
                invReturn.inv = cInv;
                invReturn.client = true;
                resolve(invReturn);
            }
        }
        for(pInv in pmInvites){
            let foundInvite = inviteArr.find(i => pInv.id === i.id);
            if(foundInvite === undefined || pInv.uses < foundInvite.uses){ // === undefined because only links that are used will not be in the arr.
                invReturn.inv = pInv;
                invReturn.pm = true;
                console.log('pInv found');
                resolve(invReturn);
            }
        }
        resolve(invReturn);
    });
};

function addRoleFromInvite(invObject, member, server){
    let newUserRole;
    if(invObject.client === true){//If the person joining is a client
        let i = clientInvites.indexOf(invObject.inv);
        console.log(roleArr[i]);
        console.log(i);
        newUserRole = roleArr[i];
        member.roles.add(newUserRole);

        if(clientInvites[i].maxUses-1 === clientInvites[i].uses){//removes from the arr only if its the invites last use has been used up
            roleArr.splice(i, 1);
            clientInvites.splice(i, 1);
        }

        invObject.inv.channel.send(`${member.user.tag} joined the 1KM chat!`);
    }
    else if(invObject.pm === true){//If the person joining is a PM
        let pmRoleName = 'Project Manager';
        newUserRole = server.roles.cache.find(role => role.name === pmRoleName);
        member.roles.add(newUserRole);

        if(pmInvites[i].maxUses-1 === pmInvites[i].uses){//removes from the arr only if its the invites last use has been used up
            pmInvites.splice(i, 1);
        }

        let pmChatChannel = server.channels.cache.find(channel => channel.name === pmChatChannelName);
        pmChatChannel.send(`${member.user.tag} joined the 1KM team!`);
    }
    else{//If the person joining was not added to the registry
        let pmChatChannel = server.channels.cache.find(channel => channel.name === pmChatChannelName);
        pmChatChannel.send(`${member.user.tag} joined the server without a role, please ensure they get access to a channel.`);
    }
}


bot.on("ready", () => {
    console.log("Bot is ready!");
});

//command handler
bot.on('message', (message) => {
    let botChannelNames = []; //add channel names you want the bot to listen to here
    if(message.content.substring(0,1) == '/' && (botChannelNames.includes(message.channel.name) || message.channel.name.includes('bot-cmds'))){
        //takes in text after / until the next space as a command. Only listens to channels specified in botChannelNames array or if the channel name has the substring 'bot-cmds'
        let args = message.content.substring(1).split(' ');
        let cmd = args[0];
        let server = message.guild; //server variable
        let cmdsDelimiter = '/';

        //handles various commands
        switch(cmd){
            // /ping
            case 'ping':
                message.reply("Pong!");
                break;

            // /newClient
            case 'newClient':
                //reformating the arguments to fit the format for Discord and seperate them into copmany and PM
                args.splice(0, 1);
                argString = args.join(' ');
                args = argString.split(cmdsDelimiter);
                args[0] = args[0].toLowerCase(); //discord servers only have lower case names
                args[0] = args[0].replace(/\s/g, '-'); //replaces space chars with dashes as server names only have dashes

                let clientName = args[0];
                let pmName = args[1];
                let inviteDuration = 168;//1 week in hours
                let inviteUses = 1;

                let folder = server.channels.cache.find(channel => channel.name === pmName);
                
                //sequential code block that creates the new role, then creates the new channel, then creates an invite for the channel
                createRole(server, clientName)
                .then(function (role) {
                    roleArr.push(role);
                    createChannel(server, clientName, role, folder)
                    .then(function(channel){
                        createChannelInvite(channel, inviteDuration, inviteUses)
                        .then(function(invite){
                            clientInvites.push(invite);
                            invite.channel.send(`Invite for ${channel}: ${invite}`);
                        });
                    });
                });
                break;

            // /newPM
            case 'newPM':
                let newPMName = args[1];
                let pmInviteDuration = 168 //1 week in hours
                let pmUses = 1;
                let pmChatChannel = server.channels.cache.find(channel => channel.name === pmChatChannelName);

                createFolder(server, newPMName)
                .then(function (folder){ //look at removing .then
                    createChannelInvite(pmChatChannel, pmInviteDuration, pmUses)
                    .then(function (invite){
                        pmInvites.push(invite);
                        pmChatChannel.send(`Welcome our newest 1KM Team member!\nHere is their invite: ${invite}`)
                    });
                });
                break;
            
            // /taskRequest
            case 'taskRequest':
                //reformating the arguments to fit the format for Discord and seperate them into task and company
                args.splice(0, 1);
                argString = args.join(' ');
                args = argString.split(cmdsDelimiter);
                args[0] = args[0].toLowerCase();
                args[0] = args[0].replace(/\s/g, '-');

                let channelName = args[0];
                let taskName = args[1];
                let lostName = 'lost-task-requests';
                let lostAndFound = server.channels.cache.find(channel => channel.name === lostName);

                let coChannel = server.channels.cache.find(channel => channel.name === channelName);
                
                if(coChannel !== undefined){
                    coChannel.send(`New task requested: ${taskName}`);
                }else{
                    lostAndFound.send(`Lost task request for company: ${channelName}\nTask requested: ${taskName}`);
                }
                break;
            
            // /invite
            case 'invite':
                //reformating the arguments to fit the format for Discord and seperate them into channel name and number of uses
                args.splice(0, 1);
                argString = args.join(' ');
                args = argString.split(cmdsDelimiter);
                args[0] = args[0].toLowerCase();
                args[0] = args[0].replace(/\s/g, '-');

                let InviteChannelName = args[0];
                let uses = args[1];
                let duration = 168;//1 week in hours

                let inviteChannel = server.channels.cache.find(channel => channel.name === InviteChannelName);
                let inviteRole = server.roles.cache.find(role => role.name === InviteChannelName);

                createChannelInvite(inviteChannel, duration, uses)
                .then(function (invite){
                    roleArr.push(inviteRole);
                    clientInvites.push(invite);
                    invite.channel.send(`Invite for ${inviteChannel}: ${invite}`)
                });
                break;

            // /help
            case 'help':
                message.reply('\nping: args[], automation: no, test for server functioning, replys with pong\n'
                 + 'newClient: args[Client Company/Project Manager Folder Name], automation: Zapier, creates a new client and channel invite under the folder of the PM assigned for the client\n'
                 + 'taskRequest: args[Company Channel Name/Task Name], automation: Zapier, sends a message in the company channel with the taskName or to the lost tasks channel if channel not found'
                 + 'invite: args[Company Channel Name/No. Times The Invite Can Be Used], automation: none, sends a message in the company channel with the invite. Doesnt work if channel not found.');
                break;
        }
    }
});

//invite manager
//trying to figure out how to automatically assign a new user to the role for their company by tracking the links

bot.on('guildMemberAdd', (member) => {
    console.log(`new member: ${member}`);
    let server = member.guild;

    console.log(clientInvites);
    member.guild.fetchInvites()
    .then( function (inviteArr){
        findInvite(inviteArr)
        .then( function (invObject){
            addRoleFromInvite(invObject, member, server);
        });
    });
    
});

//log the bot in
bot.login(process.env.DISCORD1KMBOT_TOKEN);
