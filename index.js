import { TeamChatClient } from '@zoom/rivet/teamchat';
import { ChatbotClient } from '@zoom/rivet/chatbot';
import dotenv from 'dotenv';
dotenv.config()

const CHATBOT_PORT = 4001;
const TEAMCHAT_PORT = 4002;

(async () => {
  const chatbotClient = new ChatbotClient({
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    webhooksSecretToken: process.env.WEBHOOK_SECRET_TOKEN,
    port: CHATBOT_PORT
  });

  const teamchatClient = new TeamChatClient({
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    webhooksSecretToken: process.env.WEBHOOK_SECRET_TOKEN,
    installerOptions: {
        redirectUri: `http://localhost:${TEAMCHAT_PORT}`,
        stateStore: 'secret_here',
    },
    port: TEAMCHAT_PORT,
  })

  chatbotClient.webEventConsumer.onSlashCommand('help', async ({ say }) => {
    await say({
      "head": {
        "text": "Standup Bot Help"
      }, 
      "body": [
        { "type": "message", "text": "`/standup_bot help`: Gets list of commands"},
        { "type": "divider", "style": { "bold": false, "dotted": false, "color": "#98a0a9"}},
        { "type": "message", "text": "`/standup_bot start`: Sends the standup message for the day"},
      ]
    })
  })

  chatbotClient.webEventConsumer.onSlashCommand('start', async ({ say, payload }) => {
    const channelName = payload.channelName;
    const userId = payload.userId;

    async function getChannelId (id) {
      try {

        const getChannels = async () => {
          const channels = (await teamchatClient.endpoints.chatChannels.listUsersChannels({
            path: {
              userId: id
            }
          })).data?.channels ?? [];

          if (!channels) {
            throw new Error('Cannot get channels or empty')
          }

          return channels;
        };

        const channels = await getChannels() 

        const channelId = channels.find((channel) => channel.name === channelName)?.id ?? undefined;
       
        if (!channelId) {
          await say('You can only use the standup bot in a channel.')
          throw new Error('Channel Id is undefined.')
        }

        return channelId;
        
      } catch (error) {
        throw error;
      }
    };

    let channelId = await getChannelId(userId);

    async function listChannelMembers (id) {
      try {

        const channelMembers = (await teamchatClient.endpoints.chatChannelsAccountLevel.listChannelMembers({
          path: { 
            channelId: id, 
            userId: userId
          }
        })).data?.members;

        if (!channelMembers) {
          throw new Error('Channel members are undefined.')
        }

        return channelMembers.map(({first_name, last_name }) => {
          return { firstName: first_name ?? '', lastName: last_name ?? ''}
        });

      } catch (error) {
        console.log('Cannot list channel members.', error);
        throw error;
      }
    }
    
    let channelMembers = await listChannelMembers(channelId);

    await say({
      "head": {
        "text": "Daily Standup",
        "sub_head": {
          "text": `${new Date().toLocaleDateString('en-us', { weekday:"long", year:"numeric", month:"short", day:"numeric"}) }`
        }
      },
      "body": [
        {
          "type": "fields",
          "items": channelMembers.map((member) => {
            return {
              "key": `${member.firstName} ${member.lastName}`,
              "value": " ",
              "editable": true 
            }
          })
        }
      ]
    })
  });

  chatbotClient.webEventConsumer.event('interactive_message_fields_editable', (response) => {
    const payload = response.payload;
    
    function createUpdatedAppCard(payload) {
      const appCard = payload.original;
      const editedFieldItem = payload.fieldEditItem;
      const formFieldItems = appCard.body[0].items;
      const updatedItemIndex = formFieldItems.indexOf(formFieldItems.find((item) => item.key === editedFieldItem.key))

      appCard.body[0].items[updatedItemIndex] = { editable: false, key: editedFieldItem.key, value: editedFieldItem.newValue }
      
      return appCard;
    }

    try {
      chatbotClient.endpoints.messages.editChatbotMessage({
        path: {
          message_id: payload.messageId
        },
        body: {
          robot_jid: payload.robotJid,
          user_jid: payload.userId,
          content: createUpdatedAppCard(payload)
        }
      })
    } catch(error) {
      console.log('Cannot edit chatbot message.', error);
      throw error;
    }
  });

  await teamchatClient.start()
  await chatbotClient.start()
  console.log(`Zoom Rivet events servers running on ports ${CHATBOT_PORT} and ${TEAMCHAT_PORT}...`)
})();

