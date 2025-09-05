/**
 * Discord Reminder Bot - Configuration Command Handler
 *
 * Interactive configuration management with smart UI components:
 * - Dynamic channel and role selection from guild
 * - Intelligent validation and suggestions
 * - Beautiful embeds with status indicators
 * - Multi-step configuration flows
 */

import {
  ChatInputCommandInteraction,
  ButtonInteraction,
  StringSelectMenuInteraction,
  Client,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  Message,
  ChannelType,
} from 'discord.js';
import { createLogger } from '@/utils/loggingConfig';
import { GuildConfigManager } from '@/services/guildConfigManager';
import { SqliteStorage } from '@/persistence/sqliteStorage';
import { hasAdminRole } from '@/utils/permissions';

const logger = createLogger('config-handler');

/**
 * Handle the /config command
 */
export async function handleConfigCommand(
  interaction: ChatInputCommandInteraction,
  client: Client,
): Promise<void> {
  try {
    // Validate permissions
    if (!interaction.guild || !interaction.member) {
      await interaction.reply({
        content: '❌ Cette commande ne peut être utilisée que dans un serveur.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (!hasAdminRole(interaction.member as any)) {
      await interaction.reply({
        content: '❌ Vous avez besoin des permissions administrateur pour utiliser cette commande.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Defer reply for potentially long operations
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // Get the guild config manager
    const storage = new SqliteStorage();
    await storage.initialize();
    const configManager = new GuildConfigManager(client, storage);

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'show') {
      await handleConfigShow(interaction, configManager);
    } else if (subcommand === 'set') {
      await handleConfigSet(interaction, configManager, client);
    }
  } catch (error) {
    logger.error(`Error in command : ${error}`);
    if (error instanceof Error) {
      logger.error(
        `Error details  Name: ${error.name} Stack:${error.stack} message:${error.message}`,
      );
    } else {
      logger.error(`Error details: ${String(error)}`);
    }

    try {
      const errorMessage =
        "❌ Une erreur s'est produite lors du traitement de la commande de configuration.";

      if (interaction.deferred) {
        await interaction.editReply({ content: errorMessage });
      } else if (!interaction.replied) {
        await interaction.reply({ content: errorMessage, flags: MessageFlags.Ephemeral });
      }
    } catch (replyError) {
      logger.error(`Failed to send error message to user: ${String(replyError)}`);
    }
  }
}

/**
 * Handle config show subcommand
 */
async function handleConfigShow(
  interaction: ChatInputCommandInteraction,
  configManager: GuildConfigManager,
): Promise<void> {
  const config = await configManager.getGuildConfig(interaction.guildId!);

  if (!config) {
    await interaction.editReply({
      content: '❌ Impossible de charger la configuration du serveur.',
    });
    return;
  }

  const displayValues = config.getDisplayValues();
  const guild = interaction.guild!;

  // Create beautiful configuration display embed
  const embed = new EmbedBuilder()
    .setColor(0x00ae86)
    .setTitle('⚙️ Configuration du Serveur')
    .setDescription(`Configuration actuelle pour **${guild.name}**`)
    .addFields(
      {
        name: '📢 Canal de rappel',
        value: displayValues.reminderChannel,
        inline: true,
      },
      {
        name: '👑 Rôles administrateurs',
        value: displayValues.adminRoles,
        inline: true,
      },
      {
        name: '⏰ Intervalle par défaut',
        value: displayValues.defaultInterval,
        inline: true,
      },
      {
        name: '🗑️ Suppression automatique',
        value: displayValues.autoDelete,
        inline: true,
      },
      {
        name: '📊 Limite de mentions',
        value: displayValues.mentionLimit,
        inline: true,
      },
      {
        name: '🎭 Réactions par défaut',
        value: displayValues.reactions,
        inline: true,
      },
      {
        name: '🌍 Fuseau horaire',
        value: displayValues.timezone,
        inline: false,
      },
    )
    .setThumbnail(guild.iconURL())
    .setFooter({
      text: `Dernière mise à jour • Utilisez /config set pour modifier`,
    })
    .setTimestamp(config.updatedAt);

  // Add action buttons for quick access
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('config_set_channel')
      .setLabel('📢 Canal')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('config_set_roles')
      .setLabel('👑 Rôles')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('config_set_timing')
      .setLabel('⏰ Timing')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('config_suggestions')
      .setLabel('💡 Suggestions')
      .setStyle(ButtonStyle.Primary),
  );

  await interaction.editReply({
    embeds: [embed],
    components: [row],
  });
}

/**
 * Handle config set subcommand
 */
async function handleConfigSet(
  interaction: ChatInputCommandInteraction,
  configManager: GuildConfigManager,
  client: Client,
): Promise<void> {
  const option = interaction.options.getString('option', true);
  const config = await configManager.getGuildConfig(interaction.guildId!);

  if (!config) {
    await interaction.editReply({
      content: '❌ Impossible de charger la configuration du serveur.',
    });
    return;
  }

  switch (option) {
    case 'reminder_channel':
      await handleChannelSelection(interaction, configManager, client);
      break;
    case 'admin_roles':
      await handleRoleSelection(interaction, configManager, client);
      break;
    case 'default_interval':
      await handleIntervalSelection(interaction, configManager);
      break;
    case 'auto_delete':
      await handleAutoDeleteToggle(interaction, configManager);
      break;
    case 'auto_delete_delay':
      await handleAutoDeleteDelaySelection(interaction, configManager);
      break;
    case 'max_mentions':
      await handleMaxMentionsSelection(interaction, configManager);
      break;
    case 'default_reactions':
      await handleReactionsSelection(interaction, configManager);
      break;
    case 'timezone':
      await handleTimezoneSelection(interaction, configManager);
      break;
    default:
      await interaction.editReply({
        content: '❌ Option de configuration inconnue.',
      });
  }
}

/**
 * Handle channel selection
 */
async function handleChannelSelection(
  interaction: ChatInputCommandInteraction,
  configManager: GuildConfigManager,
  client: Client,
): Promise<void> {
  const channels = await configManager.getGuildChannels(interaction.guildId!);

  if (channels.length === 0) {
    await interaction.editReply({
      content: '❌ Aucun canal textuel trouvé dans ce serveur.',
    });
    return;
  }

  // Add option for "same channel as original message"
  const channelOptions = [
    {
      label: '📝 Canal original du message',
      description: 'Envoyer les rappels dans le canal du message original',
      value: 'original_channel',
      emoji: '📝',
    },
    ...channels
      .filter(c => c.canSend)
      .slice(0, 24)
      .map(channel => ({
        label: `#${channel.name}`,
        description: `Canal ${channel.type} • Position ${channel.position}`,
        value: channel.id,
        emoji: channel.isDefault ? '🏠' : '📢',
      })),
  ];

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`config_channel_select_${interaction.user.id}`)
    .setPlaceholder('Choisir le canal pour les rappels...')
    .addOptions(channelOptions);

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

  const embed = new EmbedBuilder()
    .setColor(0x4f46e5)
    .setTitle('📢 Configuration du Canal de Rappel')
    .setDescription(
      'Choisissez où envoyer les rappels :\n\n' +
        '**📝 Canal original** : Dans le canal du message surveillé\n' +
        '**📢 Canal dédié** : Dans un canal spécifique pour tous les rappels',
    )
    .addFields({
      name: '💡 Recommandation',
      value:
        channels.length > 5
          ? 'Pour les serveurs avec beaucoup de canaux, un canal dédié évite le spam'
          : 'Le canal original convient bien pour les petits serveurs',
      inline: false,
    })
    .setFooter({ text: 'Seuls les canaux où le bot peut écrire sont affichés' });

  await interaction.editReply({
    embeds: [embed],
    components: [row],
  });

  // Setup collector for selection
  setupChannelCollector(interaction, configManager, client);
}

/**
 * Setup collector for channel selection
 */
function setupChannelCollector(
  interaction: ChatInputCommandInteraction,
  configManager: GuildConfigManager,
  client: Client,
): void {
  const filter = (i: any) =>
    i.customId.startsWith('config_channel_select_') && i.user.id === interaction.user.id;

  const collector = interaction.channel?.createMessageComponentCollector({
    filter,
    time: 300000, // 5 minutes
    max: 1,
  });

  if (collector) {
    collector.on('collect', async selectInteraction => {
      try {
        await selectInteraction.deferUpdate();

        if (!selectInteraction.isStringSelectMenu()) return;
        const selectedValue = selectInteraction.values[0];
        let channelId: string | null = null;
        let channelName = 'Canal original';

        if (selectedValue && selectedValue !== 'original_channel') {
          channelId = selectedValue;
          const channel = client.channels.cache.get(selectedValue);
          if (channel && channel.type === ChannelType.GuildText) {
            channelName = (channel as any).name;
          }
        }

        // Update configuration
        const success = await configManager.updateGuildConfig(interaction.guildId!, {
          reminderChannelId: channelId,
          reminderChannelName: channelName,
        });

        if (success) {
          const embed = new EmbedBuilder()
            .setColor(0x10b981)
            .setTitle('✅ Canal de Rappel Configuré')
            .setDescription(
              `Les rappels seront maintenant envoyés dans : **${channelName === 'Canal original' ? 'le canal original du message' : '#' + channelName}**`,
            )
            .setTimestamp();

          await selectInteraction.editReply({
            embeds: [embed],
            components: [],
          });

          logger.info(
            `Channel configuration updated for guild ${interaction.guildId}: ${channelName}`,
          );
        } else {
          await selectInteraction.editReply({
            content: '❌ Erreur lors de la sauvegarde de la configuration.',
            components: [],
          });
        }
      } catch (error) {
        logger.error(`Error in channel selection collector: ${String(error)}`);
      }
    });

    collector.on('end', async collected => {
      if (collected.size === 0) {
        try {
          await interaction.editReply({
            content:
              '⏰ Sélection expirée. Utilisez `/config set reminder_channel` pour réessayer.',
            components: [],
          });
        } catch (error) {
          logger.debug(`Could not update expired channel selection : ${String(error)}`);
        }
      }
    });
  }
}

/**
 * Handle role selection
 */
async function handleRoleSelection(
  interaction: ChatInputCommandInteraction,
  configManager: GuildConfigManager,
  client: Client,
): Promise<void> {
  const roles = await configManager.getGuildRoles(interaction.guildId!);

  if (roles.length === 0) {
    await interaction.editReply({
      content: `❌ **Aucun rôle personnalisé trouvé**

Ce serveur ne contient que des rôles managés (rôles de bots) qui ne peuvent pas être utilisés comme rôles administrateurs.

**Pour résoudre cela :**
1. Allez dans **Paramètres du serveur** → **Rôles**
2. Créez des rôles personnalisés (ex: "Admin", "Moderateur", "Coach")
3. Assignez les permissions appropriées à ces rôles
4. Réessayez cette configuration

**Rôles actuels détectés :**
${roles.length === 0 ? 'Seuls @everyone et des rôles de bots sont présents' : 'Aucun rôle utilisable'}`,
    });
    return;
  }

  // Limit to first 24 roles (Discord limit is 25 options, we need 1 for special option)
  const roleOptions = [
    {
      label: '👑 Administrateurs serveur',
      description: 'Utiliser automatiquement tous les rôles avec permissions admin',
      value: 'server_admins',
      emoji: '👑',
    },
    ...roles.slice(0, 24).map(role => ({
      label: `@${role.name}`,
      description: `${role.isAdmin ? '👑 Admin' : '👤 Standard'} • Position ${role.position}`,
      value: role.id,
      emoji: role.isAdmin ? '👑' : '👤',
    })),
  ];

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`config_role_select_${interaction.user.id}`)
    .setPlaceholder('Choisir les rôles administrateurs...')
    .setMinValues(1)
    .setMaxValues(Math.min(roleOptions.length, 10)) // Allow multiple selection
    .addOptions(roleOptions);

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

  const config = await configManager.getGuildConfig(interaction.guildId!);
  const currentRoleNames = config?.adminRoleNames || [];
  const currentRoleIds = config?.adminRoleIds || [];

  // Display current configuration
  let currentConfigText = '';
  if (currentRoleIds.length === 0 && currentRoleNames.length > 0) {
    // Server admins mode (auto)
    currentConfigText = `Mode automatique : ${currentRoleNames.join(', ')}`;
  } else if (currentRoleNames.length > 0) {
    // Specific roles mode
    currentConfigText = `Rôles configurés : ${currentRoleNames.join(', ')}`;
  } else {
    // No configuration
    currentConfigText = 'Aucun rôle configuré (admin Discord uniquement)';
  }

  const embed = new EmbedBuilder()
    .setColor(0x7c3aed)
    .setTitle('👑 Configuration des Rôles Administrateurs')
    .setDescription(
      'Choisissez quels rôles peuvent gérer le bot :\n\n' +
        '**👑 Administrateurs serveur** : Utilise automatiquement les rôles avec permissions admin\n' +
        '**👤 Rôles spécifiques** : Sélectionnez manuellement les rôles autorisés\n\n' +
        '**ℹ️ Info** : Au moins un rôle admin est requis pour contrôler le bot',
    )
    .addFields({
      name: '🔧 Configuration actuelle',
      value: currentConfigText,
      inline: false,
    })
    .setFooter({ text: 'Vous pouvez sélectionner plusieurs rôles à la fois' });

  await interaction.editReply({
    embeds: [embed],
    components: [row],
  });

  // Setup collector for selection
  setupRoleCollector(interaction, configManager, client);
}

/**
 * Setup collector for role selection
 */
function setupRoleCollector(
  interaction: ChatInputCommandInteraction,
  configManager: GuildConfigManager,
  client: Client,
): void {
  const filter = (i: any) =>
    i.customId.startsWith('config_role_select_') && i.user.id === interaction.user.id;

  const collector = interaction.channel?.createMessageComponentCollector({
    filter,
    time: 300000, // 5 minutes
    max: 1,
  });

  if (collector) {
    collector.on('collect', async selectInteraction => {
      try {
        await selectInteraction.deferUpdate();

        if (!selectInteraction.isStringSelectMenu()) return;
        const selectedValues = selectInteraction.values;
        let adminRoleIds: string[] = [];
        let adminRoleNames: string[] = [];
        let configMessage = '';

        if (selectedValues.includes('server_admins')) {
          // Use automatic server admin detection
          adminRoleIds = [];
          adminRoleNames = ['Administrateurs serveur (auto)'];
          configMessage =
            'Configuration automatique activée. Tous les rôles avec permissions administrateur peuvent gérer le bot.';
        } else {
          // Use specific selected roles
          const allRoles = await configManager.getGuildRoles(interaction.guildId!);
          const selectedRoles = allRoles.filter(role => selectedValues.includes(role.id));

          adminRoleIds = selectedRoles.map(r => r.id);
          adminRoleNames = selectedRoles.map(r => r.name);
          configMessage = `Rôles administrateurs configurés : ${adminRoleNames.map(n => `**${n}**`).join(', ')}`;
        }

        // Update configuration
        const success = await configManager.updateGuildConfig(interaction.guildId!, {
          adminRoleIds,
          adminRoleNames,
        });

        if (success) {
          const embed = new EmbedBuilder()
            .setColor(0x10b981)
            .setTitle('✅ Rôles Administrateurs Configurés')
            .setDescription(configMessage)
            .addFields({
              name: '💡 Information',
              value: selectedValues.includes('server_admins')
                ? 'Le bot détectera automatiquement les nouveaux rôles administrateurs.'
                : 'Seuls les rôles sélectionnés peuvent maintenant gérer le bot.',
              inline: false,
            })
            .setTimestamp();

          await selectInteraction.editReply({
            embeds: [embed],
            components: [],
          });

          logger.info(
            `Admin roles configuration updated for guild ${interaction.guildId}: ${adminRoleNames.join(', ')}`,
          );
        } else {
          await selectInteraction.editReply({
            content: '❌ Erreur lors de la sauvegarde de la configuration des rôles.',
            components: [],
          });
        }
      } catch (error) {
        logger.error('Error in role selection collector:', error);
      }
    });

    collector.on('end', async collected => {
      if (collected.size === 0) {
        try {
          await interaction.editReply({
            content: '⏰ Sélection expirée. Utilisez `/config set admin_roles` pour réessayer.',
            components: [],
          });
        } catch (error) {
          logger.debug('Could not update expired role selection:', error);
        }
      }
    });
  }
}

/**
 * Handle interval selection
 */
async function handleIntervalSelection(
  interaction: ChatInputCommandInteraction,
  configManager: GuildConfigManager,
): Promise<void> {
  const intervalOptions = [
    { name: '5 minutes', value: 5 },
    { name: '15 minutes', value: 15 },
    { name: '30 minutes', value: 30 },
    { name: '1 heure', value: 60 },
    { name: '2 heures', value: 120 },
    { name: '4 heures', value: 240 },
    { name: '6 heures', value: 360 },
    { name: '12 heures', value: 720 },
    { name: '24 heures', value: 1440 },
    { name: '48 heures', value: 2880 },
    { name: '1 semaine', value: 10080 },
  ];

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`config_interval_select_${interaction.user.id}`)
    .setPlaceholder("Choisir l'intervalle par défaut...")
    .addOptions(
      intervalOptions.map(option => ({
        label: option.name,
        description: `Rappel tous les ${option.name.toLowerCase()}`,
        value: option.value.toString(),
        emoji: option.value >= 1440 ? '📅' : option.value >= 60 ? '🕐' : '⏰',
      })),
    );

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

  const config = await configManager.getGuildConfig(interaction.guildId!);
  const currentInterval = config?.defaultIntervalMinutes || 1440;

  const embed = new EmbedBuilder()
    .setColor(0x059669)
    .setTitle("⏰ Configuration de l'Intervalle par Défaut")
    .setDescription(
      "Choisissez l'intervalle par défaut pour les nouveaux rappels :\n\n" +
        '• **Courts intervalles** (5-30min) : Pour les événements urgents\n' +
        '• **Intervalles moyens** (1-6h) : Pour les tâches quotidiennes\n' +
        '• **Longs intervalles** (12h-1sem) : Pour les événements planifiés',
    )
    .addFields(
      {
        name: '🔧 Configuration actuelle',
        value: `Intervalle : **${formatIntervalDisplay(currentInterval)}**`,
        inline: true,
      },
      {
        name: '💡 Recommandation',
        value: 'La plupart des serveurs utilisent 1-6 heures pour un bon équilibre',
        inline: true,
      },
    )
    .setFooter({ text: 'Les utilisateurs peuvent toujours spécifier un intervalle personnalisé' });

  await interaction.editReply({
    embeds: [embed],
    components: [row],
  });

  // Setup collector for selection
  setupIntervalCollector(interaction, configManager);
}

/**
 * Format interval for display
 */
function formatIntervalDisplay(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} minute${minutes > 1 ? 's' : ''}`;
  }
  const hours = minutes / 60;
  if (hours < 24) {
    return `${hours} heure${hours > 1 ? 's' : ''}`;
  }
  const days = hours / 24;
  if (days < 7) {
    return `${days} jour${days > 1 ? 's' : ''}`;
  }
  const weeks = days / 7;
  return `${weeks} semaine${weeks > 1 ? 's' : ''}`;
}

/**
 * Setup collector for interval selection
 */
function setupIntervalCollector(
  interaction: ChatInputCommandInteraction,
  configManager: GuildConfigManager,
): void {
  const filter = (i: any) =>
    i.customId.startsWith('config_interval_select_') && i.user.id === interaction.user.id;

  const collector = interaction.channel?.createMessageComponentCollector({
    filter,
    time: 300000, // 5 minutes
    max: 1,
  });

  if (collector) {
    collector.on('collect', async selectInteraction => {
      try {
        await selectInteraction.deferUpdate();

        if (!selectInteraction.isStringSelectMenu()) return;
        const firstValue = selectInteraction.values[0];
        if (!firstValue) return;
        const selectedValue = parseInt(firstValue);

        // Validate interval
        if (selectedValue < 5 || selectedValue > 10080) {
          await selectInteraction.editReply({
            content: '❌ Intervalle invalide. Veuillez choisir entre 5 minutes et 1 semaine.',
            components: [],
          });
          return;
        }

        // Update configuration
        const success = await configManager.updateGuildConfig(interaction.guildId!, {
          defaultIntervalMinutes: selectedValue,
        });

        if (success) {
          const embed = new EmbedBuilder()
            .setColor(0x10b981)
            .setTitle('✅ Intervalle par Défaut Configuré')
            .setDescription(
              `L'intervalle par défaut est maintenant : **${formatIntervalDisplay(selectedValue)}**`,
            )
            .addFields({
              name: '💡 Information',
              value:
                "Cet intervalle sera utilisé par défaut pour tous les nouveaux rappels. Les utilisateurs peuvent toujours spécifier un intervalle personnalisé lors de l'utilisation de `/watch`.",
              inline: false,
            })
            .setTimestamp();

          await selectInteraction.editReply({
            embeds: [embed],
            components: [],
          });

          logger.info(
            `Default interval updated for guild ${interaction.guildId}: ${selectedValue} minutes`,
          );
        } else {
          await selectInteraction.editReply({
            content: "❌ Erreur lors de la sauvegarde de la configuration de l'intervalle.",
            components: [],
          });
        }
      } catch (error) {
        logger.error('Error in interval selection collector:', error);
      }
    });

    collector.on('end', async collected => {
      if (collected.size === 0) {
        try {
          await interaction.editReply({
            content:
              '⏰ Sélection expirée. Utilisez `/config set default_interval` pour réessayer.',
            components: [],
          });
        } catch (error) {
          logger.debug('Could not update expired interval selection:', error);
        }
      }
    });
  }
}

/**
 * Handle auto delete toggle
 */
async function handleAutoDeleteToggle(
  interaction: ChatInputCommandInteraction,
  configManager: GuildConfigManager,
): Promise<void> {
  const config = await configManager.getGuildConfig(interaction.guildId!);
  const currentEnabled = config?.autoDeleteEnabled || false;

  const toggleOptions = [
    {
      label: '✅ Activer la suppression automatique',
      description: 'Les rappels seront supprimés automatiquement après un délai',
      value: 'enable',
      emoji: '✅',
    },
    {
      label: '❌ Désactiver la suppression automatique',
      description: 'Les rappels resteront visibles en permanence',
      value: 'disable',
      emoji: '❌',
    },
  ];

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`config_autodelete_select_${interaction.user.id}`)
    .setPlaceholder('Choisir le mode de suppression...')
    .addOptions(toggleOptions);

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

  const embed = new EmbedBuilder()
    .setColor(currentEnabled ? 0xef4444 : 0x6b7280)
    .setTitle('🗑️ Configuration de la Suppression Automatique')
    .setDescription(
      'Configurez si les rappels doivent être supprimés automatiquement :\n\n' +
        '• **✅ Activée** : Les rappels sont supprimés après le délai configuré\n' +
        '• **❌ Désactivée** : Les rappels restent visibles en permanence',
    )
    .addFields(
      {
        name: '🔧 Configuration actuelle',
        value: currentEnabled
          ? `**Activée** (délai: ${config!.getAutoDeleteDelayHours()}h)`
          : '**Désactivée**',
        inline: true,
      },
      {
        name: '💡 Recommandation',
        value: "Activez pour éviter l'encombrement des canaux avec d'anciens rappels",
        inline: true,
      },
    )
    .setFooter({ text: 'Vous pourrez configurer le délai de suppression séparément' });

  await interaction.editReply({
    embeds: [embed],
    components: [row],
  });

  // Setup collector for selection
  setupAutoDeleteCollector(interaction, configManager);
}

/**
 * Setup collector for auto delete toggle
 */
function setupAutoDeleteCollector(
  interaction: ChatInputCommandInteraction,
  configManager: GuildConfigManager,
): void {
  const filter = (i: any) =>
    i.customId.startsWith('config_autodelete_select_') && i.user.id === interaction.user.id;

  const collector = interaction.channel?.createMessageComponentCollector({
    filter,
    time: 300000, // 5 minutes
    max: 1,
  });

  if (collector) {
    collector.on('collect', async selectInteraction => {
      try {
        await selectInteraction.deferUpdate();

        if (!selectInteraction.isStringSelectMenu()) return;
        const selectedValue = selectInteraction.values[0];
        const enabled = selectedValue === 'enable';

        // Update configuration
        const success = await configManager.updateGuildConfig(interaction.guildId!, {
          autoDeleteEnabled: enabled,
        });

        if (success) {
          const embed = new EmbedBuilder()
            .setColor(enabled ? 0x10b981 : 0x6b7280)
            .setTitle('✅ Suppression Automatique Configurée')
            .setDescription(
              enabled
                ? 'La suppression automatique des rappels est maintenant **activée**.'
                : 'La suppression automatique des rappels est maintenant **désactivée**.',
            )
            .addFields({
              name: '💡 Information',
              value: enabled
                ? 'Les rappels seront supprimés automatiquement. Configurez le délai avec `/config set auto_delete_delay`.'
                : "Les rappels resteront visibles en permanence jusqu'à suppression manuelle.",
              inline: false,
            })
            .setTimestamp();

          await selectInteraction.editReply({
            embeds: [embed],
            components: [],
          });

          logger.info(
            `Auto delete configuration updated for guild ${interaction.guildId}: ${enabled}`,
          );
        } else {
          await selectInteraction.editReply({
            content:
              '❌ Erreur lors de la sauvegarde de la configuration de suppression automatique.',
            components: [],
          });
        }
      } catch (error) {
        logger.error('Error in auto delete selection collector:', error);
      }
    });

    collector.on('end', async collected => {
      if (collected.size === 0) {
        try {
          await interaction.editReply({
            content: '⏰ Sélection expirée. Utilisez `/config set auto_delete` pour réessayer.',
            components: [],
          });
        } catch (error) {
          logger.debug('Could not update expired auto delete selection:', error);
        }
      }
    });
  }
}

/**
 * Handle auto delete delay selection
 */
async function handleAutoDeleteDelaySelection(
  interaction: ChatInputCommandInteraction,
  configManager: GuildConfigManager,
): Promise<void> {
  const delayOptions = [
    { name: '30 secondes', minutes: 0.5 },
    { name: '1 minute', minutes: 1 },
    { name: '5 minutes', minutes: 5 },
    { name: '15 minutes', minutes: 15 },
    { name: '30 minutes', minutes: 30 },
    { name: '1 heure', minutes: 60 },
    { name: '2 heures', minutes: 120 },
    { name: '6 heures', minutes: 360 },
    { name: '12 heures', minutes: 720 },
    { name: '24 heures', minutes: 1440 },
  ];

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`config_delete_delay_select_${interaction.user.id}`)
    .setPlaceholder('Choisir le délai de suppression...')
    .addOptions(
      delayOptions.map(option => ({
        label: option.name,
        description: `Supprimer les rappels après ${option.name.toLowerCase()}`,
        value: option.minutes.toString(),
        emoji: option.minutes < 60 ? '⚡' : option.minutes < 1440 ? '🕐' : '📅',
      })),
    );

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

  const config = await configManager.getGuildConfig(interaction.guildId!);
  const currentDelayMinutes = config?.autoDeleteDelayMinutes || 60;
  const currentDelayHours = config?.getAutoDeleteDelayHours() || 1;

  const embed = new EmbedBuilder()
    .setColor(0xf59e0b)
    .setTitle('⏳ Configuration du Délai de Suppression')
    .setDescription(
      'Choisissez après combien de temps supprimer automatiquement les rappels :\n\n' +
        "• **Délais courts** (30s-15min) : Pour éviter l'encombrement rapide\n" +
        '• **Délais moyens** (30min-2h) : Équilibre entre lisibilité et historique\n' +
        '• **Délais longs** (6h-24h) : Garder un historique plus complet',
    )
    .addFields(
      {
        name: '🔧 Configuration actuelle',
        value: config?.autoDeleteEnabled
          ? `**${formatIntervalDisplay(currentDelayMinutes)}**`
          : 'Suppression automatique désactivée',
        inline: true,
      },
      {
        name: '💡 Recommandation',
        value: 'Entre 30 minutes et 2 heures pour la plupart des serveurs',
        inline: true,
      },
    )
    .setFooter({ text: "Activez d'abord la suppression automatique si ce n'est pas fait" });

  await interaction.editReply({
    embeds: [embed],
    components: [row],
  });

  // Setup collector for selection
  setupDeleteDelayCollector(interaction, configManager);
}

/**
 * Setup collector for delete delay selection
 */
function setupDeleteDelayCollector(
  interaction: ChatInputCommandInteraction,
  configManager: GuildConfigManager,
): void {
  const filter = (i: any) =>
    i.customId.startsWith('config_delete_delay_select_') && i.user.id === interaction.user.id;

  const collector = interaction.channel?.createMessageComponentCollector({
    filter,
    time: 300000, // 5 minutes
    max: 1,
  });

  if (collector) {
    collector.on('collect', async selectInteraction => {
      try {
        await selectInteraction.deferUpdate();

        if (!selectInteraction.isStringSelectMenu()) return;
        const firstValue = selectInteraction.values[0];
        if (!firstValue) return;
        const selectedValue = parseFloat(firstValue);

        // Validate delay
        if (selectedValue < 0.5 || selectedValue > 1440) {
          await selectInteraction.editReply({
            content: '❌ Délai invalide. Veuillez choisir entre 30 secondes et 24 heures.',
            components: [],
          });
          return;
        }

        // Update configuration
        const success = await configManager.updateGuildConfig(interaction.guildId!, {
          autoDeleteDelayMinutes: selectedValue,
          autoDeleteEnabled: true, // Auto-enable when setting delay
        });

        if (success) {
          const embed = new EmbedBuilder()
            .setColor(0x10b981)
            .setTitle('✅ Délai de Suppression Configuré')
            .setDescription(
              `Le délai de suppression automatique est maintenant : **${formatIntervalDisplay(selectedValue)}**`,
            )
            .addFields({
              name: '💡 Information',
              value:
                'La suppression automatique a été activée automatiquement. Les rappels seront supprimés après le délai configuré.',
              inline: false,
            })
            .setTimestamp();

          await selectInteraction.editReply({
            embeds: [embed],
            components: [],
          });

          logger.info(
            `Auto delete delay updated for guild ${interaction.guildId}: ${selectedValue} minutes`,
          );
        } else {
          await selectInteraction.editReply({
            content: '❌ Erreur lors de la sauvegarde du délai de suppression.',
            components: [],
          });
        }
      } catch (error) {
        logger.error('Error in delete delay selection collector:', error);
      }
    });

    collector.on('end', async collected => {
      if (collected.size === 0) {
        try {
          await interaction.editReply({
            content:
              '⏰ Sélection expirée. Utilisez `/config set auto_delete_delay` pour réessayer.',
            components: [],
          });
        } catch (error) {
          logger.debug('Could not update expired delete delay selection:', error);
        }
      }
    });
  }
}

/**
 * Handle max mentions selection
 */
async function handleMaxMentionsSelection(
  interaction: ChatInputCommandInteraction,
  configManager: GuildConfigManager,
): Promise<void> {
  const mentionOptions = [
    {
      name: 'Aucune limite',
      value: 0,
      description: 'Mentionner tous les utilisateurs individuellement',
    },
    {
      name: '10 utilisateurs max',
      value: 10,
      description: 'Utiliser @everyone si plus de 10 réactions',
    },
    {
      name: '20 utilisateurs max',
      value: 20,
      description: 'Utiliser @everyone si plus de 20 réactions',
    },
    {
      name: '30 utilisateurs max',
      value: 30,
      description: 'Utiliser @everyone si plus de 30 réactions',
    },
    {
      name: '50 utilisateurs max',
      value: 50,
      description: 'Utiliser @everyone si plus de 50 réactions',
    },
    {
      name: '75 utilisateurs max',
      value: 75,
      description: 'Utiliser @everyone si plus de 75 réactions',
    },
    {
      name: '100 utilisateurs max',
      value: 100,
      description: 'Utiliser @everyone si plus de 100 réactions',
    },
  ];

  // Create two select menus: one for limit, one for behavior
  const limitSelectMenu = new StringSelectMenuBuilder()
    .setCustomId(`config_mention_limit_select_${interaction.user.id}`)
    .setPlaceholder('Choisir la limite de mentions...')
    .addOptions(
      mentionOptions.map(option => ({
        label: option.name,
        description: option.description,
        value: option.value.toString(),
        emoji: option.value === 0 ? '∞' : option.value <= 30 ? '👥' : '👨‍👩‍👧‍👦',
      })),
    );

  const behaviorOptions = [
    {
      label: '@ Utiliser @everyone au-dessus de la limite',
      description: 'Basculer vers @everyone quand trop de réactions',
      value: 'use_everyone',
      emoji: '📢',
    },
    {
      label: '🚫 Stopper les mentions à la limite',
      description: 'Ne pas mentionner au-delà de la limite',
      value: 'stop_at_limit',
      emoji: '🚫',
    },
  ];

  const behaviorSelectMenu = new StringSelectMenuBuilder()
    .setCustomId(`config_mention_behavior_select_${interaction.user.id}`)
    .setPlaceholder('Choisir le comportement...')
    .addOptions(behaviorOptions);

  const row1 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(limitSelectMenu);
  const row2 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(behaviorSelectMenu);

  const config = await configManager.getGuildConfig(interaction.guildId!);
  const currentLimit = config?.maxMentionsPerReminder || 50;
  const useEveryone = config?.useEveryoneAboveLimit || true;

  const embed = new EmbedBuilder()
    .setColor(0x8b5cf6)
    .setTitle('📊 Configuration des Limites de Mentions')
    .setDescription(
      'Configurez le comportement des mentions dans les rappels :\n\n' +
        '• **Limite basse** (10-20) : Évite le spam, bascule rapidement vers @everyone\n' +
        '• **Limite moyenne** (30-50) : Équilibre entre mentions individuelles et @everyone\n' +
        '• **Limite haute** (75-100) : Privilégie les mentions individuelles',
    )
    .addFields(
      {
        name: '🔧 Configuration actuelle',
        value:
          currentLimit === 0
            ? 'Aucune limite (toujours individuel)'
            : `Limite : **${currentLimit}** • Comportement : **${useEveryone ? '@everyone au-dessus' : 'Arrêt à la limite'}**`,
        inline: false,
      },
      {
        name: '💡 Pourquoi une limite ?',
        value: 'Discord limite les messages longs. @everyone évite les messages tronqués.',
        inline: true,
      },
      {
        name: '🎯 Recommandation',
        value: '30-50 utilisateurs avec @everyone pour la plupart des serveurs',
        inline: true,
      },
    )
    .setFooter({ text: "Configurez d'abord la limite, puis le comportement" });

  await interaction.editReply({
    embeds: [embed],
    components: [row1, row2],
  });

  // Setup collectors for both selections
  setupMentionCollectors(interaction, configManager);
}

/**
 * Setup collectors for mention configuration
 */
function setupMentionCollectors(
  interaction: ChatInputCommandInteraction,
  configManager: GuildConfigManager,
): void {
  let selectedLimit: number | null = null;
  let selectedBehavior: boolean | null = null;

  // Limit collector
  const limitFilter = (i: any) =>
    i.customId.startsWith('config_mention_limit_select_') && i.user.id === interaction.user.id;

  const limitCollector = interaction.channel?.createMessageComponentCollector({
    filter: limitFilter,
    time: 300000, // 5 minutes
    max: 1,
  });

  // Behavior collector
  const behaviorFilter = (i: any) =>
    i.customId.startsWith('config_mention_behavior_select_') && i.user.id === interaction.user.id;

  const behaviorCollector = interaction.channel?.createMessageComponentCollector({
    filter: behaviorFilter,
    time: 300000, // 5 minutes
    max: 1,
  });

  async function updateConfigIfComplete() {
    if (selectedLimit !== null && selectedBehavior !== null) {
      const success = await configManager.updateGuildConfig(interaction.guildId!, {
        maxMentionsPerReminder: selectedLimit,
        useEveryoneAboveLimit: selectedBehavior,
      });

      if (success) {
        const embed = new EmbedBuilder()
          .setColor(0x10b981)
          .setTitle('✅ Configuration des Mentions Mise à Jour')
          .setDescription(
            selectedLimit === 0
              ? 'Aucune limite : Tous les utilisateurs seront mentionnés individuellement.'
              : `Limite configurée : **${selectedLimit} utilisateurs**\n` +
                  `Comportement : **${selectedBehavior ? 'Utiliser @everyone au-dessus' : 'Arrêter les mentions à la limite'}**`,
          )
          .addFields({
            name: '💡 Information',
            value: selectedBehavior
              ? 'Quand il y a plus de réactions que la limite, le bot utilisera @everyone pour éviter les messages trop longs.'
              : "Le bot ne mentionnera que les premiers utilisateurs jusqu'à la limite configurée.",
            inline: false,
          })
          .setTimestamp();

        await interaction.editReply({
          embeds: [embed],
          components: [],
        });

        logger.info(
          `Mention configuration updated for guild ${interaction.guildId}: limit=${selectedLimit}, useEveryone=${selectedBehavior}`,
        );
      } else {
        await interaction.editReply({
          content: '❌ Erreur lors de la sauvegarde de la configuration des mentions.',
          components: [],
        });
      }
    }
  }

  if (limitCollector) {
    limitCollector.on('collect', async selectInteraction => {
      try {
        await selectInteraction.deferUpdate();
        if (!selectInteraction.isStringSelectMenu()) return;
        const firstValue = selectInteraction.values[0];
        if (!firstValue) return;
        selectedLimit = parseInt(firstValue);

        await selectInteraction.editReply({
          content: `✅ Limite sélectionnée : **${selectedLimit === 0 ? 'Aucune limite' : selectedLimit + ' utilisateurs'}**. Maintenant choisissez le comportement.`,
        });

        await updateConfigIfComplete();
      } catch (error) {
        logger.error('Error in mention limit collector:', error);
      }
    });
  }

  if (behaviorCollector) {
    behaviorCollector.on('collect', async selectInteraction => {
      try {
        await selectInteraction.deferUpdate();
        if (!selectInteraction.isStringSelectMenu()) return;
        selectedBehavior = selectInteraction.values[0] === 'use_everyone';

        await selectInteraction.editReply({
          content: `✅ Comportement sélectionné : **${selectedBehavior ? 'Utiliser @everyone' : 'Arrêter à la limite'}**. ${selectedLimit !== null ? 'Configuration sauvegardée !' : 'Maintenant choisissez la limite.'}`,
        });

        await updateConfigIfComplete();
      } catch (error) {
        logger.error('Error in mention behavior collector:', error);
      }
    });
  }

  // Handle expiration
  const handleExpiration = async () => {
    try {
      await interaction.editReply({
        content: '⏰ Configuration expirée. Utilisez `/config set max_mentions` pour réessayer.',
        components: [],
      });
    } catch (error) {
      logger.debug('Could not update expired mention configuration:', error);
    }
  };

  limitCollector?.on('end', collected => {
    if (collected.size === 0 && selectedLimit === null) {
      handleExpiration();
    }
  });

  behaviorCollector?.on('end', collected => {
    if (collected.size === 0 && selectedBehavior === null) {
      handleExpiration();
    }
  });
}

/**
 * Handle reactions selection
 */
async function handleReactionsSelection(
  interaction: ChatInputCommandInteraction,
  configManager: GuildConfigManager,
): Promise<void> {
  const reactionPresets = [
    {
      name: 'Présence Simple',
      reactions: ['✅', '❌'],
      description: 'Présent / Absent uniquement',
    },
    {
      name: 'Présence Complète',
      reactions: ['✅', '❌', '❓'],
      description: 'Présent / Absent / Peut-être',
    },
    {
      name: 'Événement Sport',
      reactions: ['⚽', '🏃‍♂️', '❌', '🤕'],
      description: 'Match / Entraînement / Absent / Blessé',
    },
    {
      name: 'Réunion Gaming',
      reactions: ['🎮', '🎯', '❌', '⏰'],
      description: 'Prêt / Concentré / Absent / En retard',
    },
    {
      name: 'Événement Général',
      reactions: ['👍', '👎', '🤷', '❤️'],
      description: "J'aime / J'aime pas / Indifférent / Adoré",
    },
  ];

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`config_reactions_preset_select_${interaction.user.id}`)
    .setPlaceholder('Choisir un modèle de réactions...')
    .addOptions([
      ...reactionPresets.map((preset, index) => {
        const firstReaction = preset.reactions[0];
        return {
          label: preset.name,
          description: `${preset.reactions.join(' ')} - ${preset.description}`,
          value: index.toString(),
          ...(firstReaction && { emoji: firstReaction }),
        };
      }),
      {
        label: '🎨 Configuration personnalisée',
        description: 'Créer votre propre ensemble de réactions',
        value: 'custom',
        emoji: '🎨',
      },
    ]);

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

  const config = await configManager.getGuildConfig(interaction.guildId!);
  const currentReactions = config?.defaultReactions || ['✅', '❌', '❓'];

  const embed = new EmbedBuilder()
    .setColor(0xf59e0b)
    .setTitle('🎭 Configuration des Réactions par Défaut')
    .setDescription(
      'Choisissez les réactions ajoutées automatiquement aux nouveaux événements :\n\n' +
        "• **Modèles prédéfinis** : Configurations adaptées à différents types d'événements\n" +
        '• **Configuration personnalisée** : Créez votre propre ensemble de réactions',
    )
    .addFields(
      {
        name: '🔧 Réactions actuelles',
        value: `${currentReactions.join(' ')} (${currentReactions.length} réactions)`,
        inline: true,
      },
      {
        name: '💡 Conseil',
        value: '2-4 réactions sont idéales pour la plupart des événements',
        inline: true,
      },
    )
    .setFooter({
      text: 'Ces réactions seront ajoutées automatiquement aux nouveaux événements surveillés',
    });

  await interaction.editReply({
    embeds: [embed],
    components: [row],
  });

  // Setup collector for selection
  setupReactionsCollector(interaction, configManager, reactionPresets);
}

/**
 * Setup collector for reactions selection
 */
function setupReactionsCollector(
  interaction: ChatInputCommandInteraction,
  configManager: GuildConfigManager,
  reactionPresets: Array<{ name: string; reactions: string[]; description: string }>,
): void {
  const filter = (i: any) =>
    i.customId.startsWith('config_reactions_preset_select_') && i.user.id === interaction.user.id;

  const collector = interaction.channel?.createMessageComponentCollector({
    filter,
    time: 300000, // 5 minutes
    max: 1,
  });

  if (collector) {
    collector.on('collect', async selectInteraction => {
      try {
        await selectInteraction.deferUpdate();

        if (!selectInteraction.isStringSelectMenu()) return;
        const selectedValue = selectInteraction.values[0];

        if (selectedValue === 'custom') {
          // Handle custom reaction configuration
          await handleCustomReactionsInput(selectInteraction, configManager);
        } else {
          // Use preset
          if (!selectedValue) return;
          const presetIndex = parseInt(selectedValue);
          const selectedPreset = reactionPresets[presetIndex];

          if (!selectedPreset) {
            await selectInteraction.editReply({
              content: '❌ Modèle de réactions invalide.',
              components: [],
            });
            return;
          }

          // Update configuration
          const success = await configManager.updateGuildConfig(interaction.guildId!, {
            defaultReactions: selectedPreset.reactions,
          });

          if (success) {
            const embed = new EmbedBuilder()
              .setColor(0x10b981)
              .setTitle('✅ Réactions par Défaut Configurées')
              .setDescription(`Modèle **${selectedPreset.name}** appliqué avec succès !`)
              .addFields(
                {
                  name: '🎭 Réactions configurées',
                  value: `${selectedPreset.reactions.join(' ')} (${selectedPreset.reactions.length} réactions)`,
                  inline: false,
                },
                {
                  name: '💡 Information',
                  value:
                    'Ces réactions seront automatiquement ajoutées aux nouveaux événements que vous surveillez avec `/watch`.',
                  inline: false,
                },
              )
              .setTimestamp();

            await selectInteraction.editReply({
              embeds: [embed],
              components: [],
            });

            logger.info(
              `Default reactions updated for guild ${interaction.guildId}: ${selectedPreset.reactions.join(', ')}`,
            );
          } else {
            await selectInteraction.editReply({
              content: '❌ Erreur lors de la sauvegarde des réactions par défaut.',
              components: [],
            });
          }
        }
      } catch (error) {
        logger.error('Error in reactions selection collector:', error);
      }
    });

    collector.on('end', async collected => {
      if (collected.size === 0) {
        try {
          await interaction.editReply({
            content:
              '⏰ Sélection expirée. Utilisez `/config set default_reactions` pour réessayer.',
            components: [],
          });
        } catch (error) {
          logger.debug('Could not update expired reactions selection:', error);
        }
      }
    });
  }
}

/**
 * Handle custom reactions input
 */
async function handleCustomReactionsInput(
  interaction: ChatInputCommandInteraction | StringSelectMenuInteraction,
  configManager: GuildConfigManager,
): Promise<void> {
  const embed = new EmbedBuilder()
    .setColor(0x3b82f6)
    .setTitle('🎨 Configuration Personnalisée des Réactions')
    .setDescription(
      'Tapez les émojis que vous voulez utiliser, séparés par des espaces.\n\n' +
        '**Exemples :**\n' +
        '• `✅ ❌ ❓` (basique)\n' +
        '• `👍 👎 🤷 💯` (expressif)\n' +
        '• `🟢 🔴 🟡 ⚪` (couleurs)\n\n' +
        '**Limites :** 2-10 réactions maximum',
    )
    .setFooter({ text: 'Vous avez 2 minutes pour répondre. Tapez "annuler" pour abandonner.' });

  await interaction.editReply({
    embeds: [embed],
    components: [],
  });

  // Setup message collector for custom input
  const messageFilter = (m: Message) => m.author.id === interaction.user.id;

  // Type guard to ensure channel supports message collection
  const channel = interaction.channel;
  if (!channel || !('createMessageCollector' in channel)) {
    await interaction.editReply({
      content: '❌ Impossible de créer un collecteur de messages dans ce type de canal.',
      embeds: [],
    });
    return;
  }

  const messageCollector = channel.createMessageCollector({
    filter: messageFilter,
    time: 120000, // 2 minutes
    max: 1,
  });

  if (messageCollector) {
    messageCollector.on('collect', async (message: Message) => {
      try {
        const input = message.content.trim();

        if (input.toLowerCase() === 'annuler') {
          await interaction.editReply({
            content: '❌ Configuration personnalisée annulée.',
            embeds: [],
          });
          return;
        }

        // Parse reactions from input
        const reactions = input.split(/\s+/).filter((r: string) => r.length > 0);

        // Validate reactions
        if (reactions.length < 2 || reactions.length > 10) {
          await message.reply({
            content: '❌ Veuillez fournir entre 2 et 10 réactions. Réessayez.',
            flags: MessageFlags.Ephemeral as any,
          });
          return;
        }

        // Update configuration
        const success = await configManager.updateGuildConfig(interaction.guildId!, {
          defaultReactions: reactions,
        });

        if (success) {
          const embed = new EmbedBuilder()
            .setColor(0x10b981)
            .setTitle('✅ Réactions Personnalisées Configurées')
            .setDescription('Votre configuration personnalisée a été appliquée avec succès !')
            .addFields({
              name: '🎭 Vos réactions',
              value: `${reactions.join(' ')} (${reactions.length} réactions)`,
              inline: false,
            })
            .setTimestamp();

          await interaction.editReply({
            embeds: [embed],
            components: [],
          });

          // Delete user's message to keep channel clean
          try {
            await message.delete();
          } catch {
            // Ignore if can't delete (permissions)
          }

          logger.info(
            `Custom default reactions updated for guild ${interaction.guildId}: ${reactions.join(', ')}`,
          );
        } else {
          await message.reply({
            content: '❌ Erreur lors de la sauvegarde des réactions personnalisées.',
            flags: MessageFlags.Ephemeral as any,
          });
        }
      } catch (error) {
        logger.error('Error in custom reactions collector:', error);
      }
    });

    messageCollector.on('end', (collected, reason) => {
      if (collected.size === 0) {
        // Handle async operations in a fire-and-forget manner
        interaction
          .editReply({
            content:
              '⏰ Temps écoulé pour la configuration personnalisée. Utilisez `/config set default_reactions` pour réessayer.',
            embeds: [],
          })
          .catch(error => {
            logger.debug('Could not update expired custom reactions:', error);
          });
      }
    });
  }
}

/**
 * Handle timezone selection
 */
async function handleTimezoneSelection(
  interaction: ChatInputCommandInteraction,
  configManager: GuildConfigManager,
): Promise<void> {
  const timezoneOptions = [
    { name: '🇫🇷 France (Paris)', value: 'Europe/Paris', offset: '+01:00' },
    { name: '🇧🇪 Belgique (Bruxelles)', value: 'Europe/Brussels', offset: '+01:00' },
    { name: '🇨🇭 Suisse (Zurich)', value: 'Europe/Zurich', offset: '+01:00' },
    { name: '🇨🇦 Canada Est (Toronto)', value: 'America/Toronto', offset: '-05:00' },
    { name: '🇨🇦 Canada Ouest (Vancouver)', value: 'America/Vancouver', offset: '-08:00' },
    { name: '🇺🇸 USA Est (New York)', value: 'America/New_York', offset: '-05:00' },
    { name: '🇺🇸 USA Ouest (Los Angeles)', value: 'America/Los_Angeles', offset: '-08:00' },
    { name: '🇬🇧 Royaume-Uni (Londres)', value: 'Europe/London', offset: '+00:00' },
    { name: '🇩🇪 Allemagne (Berlin)', value: 'Europe/Berlin', offset: '+01:00' },
    { name: '🇪🇸 Espagne (Madrid)', value: 'Europe/Madrid', offset: '+01:00' },
    { name: '🇮🇹 Italie (Rome)', value: 'Europe/Rome', offset: '+01:00' },
    { name: '🇯🇵 Japon (Tokyo)', value: 'Asia/Tokyo', offset: '+09:00' },
    { name: '🇦🇺 Australie (Sydney)', value: 'Australia/Sydney', offset: '+11:00' },
    { name: '🌍 UTC (Temps universel)', value: 'UTC', offset: '+00:00' },
  ];

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`config_timezone_select_${interaction.user.id}`)
    .setPlaceholder('Choisir le fuseau horaire...')
    .addOptions(
      timezoneOptions.map(tz => {
        const emojiPart = tz.name.split(' ')[0];
        return {
          label: tz.name,
          description: `${tz.value} (${tz.offset})`,
          value: tz.value,
          ...(emojiPart && { emoji: emojiPart }),
        };
      }),
    );

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

  const config = await configManager.getGuildConfig(interaction.guildId!);
  const currentTimezone = config?.timezone || 'Europe/Paris';

  // Get current time in the configured timezone for display
  const now = new Date();
  const currentTime = now.toLocaleString('fr-FR', {
    timeZone: currentTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  const embed = new EmbedBuilder()
    .setColor(0x3b82f6)
    .setTitle('🌍 Configuration du Fuseau Horaire')
    .setDescription(
      'Choisissez le fuseau horaire pour votre serveur :\n\n' +
        "• **Calculs de temps** : Heures d'événements et rappels\n" +
        '• **Affichage** : Timestamps dans vos messages\n' +
        '• **Planification** : Cohérence des horaires pour tous les membres',
    )
    .addFields(
      {
        name: '🔧 Fuseau horaire actuel',
        value: `**${currentTimezone}**\nHeure actuelle : ${currentTime}`,
        inline: true,
      },
      {
        name: '💡 Conseil',
        value: 'Choisissez le fuseau horaire de la majorité de vos membres',
        inline: true,
      },
    )
    .setFooter({ text: 'Ce paramètre affecte tous les calculs de temps du bot' });

  await interaction.editReply({
    embeds: [embed],
    components: [row],
  });

  // Setup collector for selection
  setupTimezoneCollector(interaction, configManager, timezoneOptions);
}

/**
 * Setup collector for timezone selection
 */
function setupTimezoneCollector(
  interaction: ChatInputCommandInteraction,
  configManager: GuildConfigManager,
  timezoneOptions: Array<{ name: string; value: string; offset: string }>,
): void {
  const filter = (i: any) =>
    i.customId.startsWith('config_timezone_select_') && i.user.id === interaction.user.id;

  const collector = interaction.channel?.createMessageComponentCollector({
    filter,
    time: 300000, // 5 minutes
    max: 1,
  });

  if (collector) {
    collector.on('collect', async selectInteraction => {
      try {
        await selectInteraction.deferUpdate();

        if (!selectInteraction.isStringSelectMenu()) return;
        const selectedTimezone = selectInteraction.values[0];
        if (!selectedTimezone) return;
        const selectedOption = timezoneOptions.find(tz => tz.value === selectedTimezone);

        if (!selectedOption) {
          await selectInteraction.editReply({
            content: '❌ Fuseau horaire invalide.',
            components: [],
          });
          return;
        }

        // Update configuration
        const success = await configManager.updateGuildConfig(interaction.guildId!, {
          timezone: selectedTimezone,
        });

        if (success) {
          // Get current time in the new timezone for confirmation
          const now = new Date();
          const newTime = now.toLocaleString('fr-FR', {
            timeZone: selectedTimezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          });

          const embed = new EmbedBuilder()
            .setColor(0x10b981)
            .setTitle('✅ Fuseau Horaire Configuré')
            .setDescription(
              `Le fuseau horaire a été mis à jour vers **${selectedOption.name.replace(/🇫🇷|🇧🇪|🇨🇭|🇨🇦|🇺🇸|🇬🇧|🇩🇪|🇪🇸|🇮🇹|🇯🇵|🇦🇺|🌍/g, '').trim()}**`,
            )
            .addFields(
              {
                name: '🌍 Nouveau fuseau horaire',
                value: `**${selectedTimezone}**\nHeure actuelle : ${newTime}`,
                inline: true,
              },
              {
                name: '💡 Information',
                value:
                  'Tous les nouveaux événements et rappels utiliseront ce fuseau horaire. Les événements existants conservent leur fuseau horaire original.',
                inline: false,
              },
            )
            .setTimestamp();

          await selectInteraction.editReply({
            embeds: [embed],
            components: [],
          });

          logger.info(`Timezone updated for guild ${interaction.guildId}: ${selectedTimezone}`);
        } else {
          await selectInteraction.editReply({
            content: '❌ Erreur lors de la sauvegarde du fuseau horaire.',
            components: [],
          });
        }
      } catch (error) {
        logger.error('Error in timezone selection collector:', error);
      }
    });

    collector.on('end', async collected => {
      if (collected.size === 0) {
        try {
          await interaction.editReply({
            content: '⏰ Sélection expirée. Utilisez `/config set timezone` pour réessayer.',
            components: [],
          });
        } catch (error) {
          logger.debug('Could not update expired timezone selection:', error);
        }
      }
    });
  }
}

/**
 * Handle button interactions from config show command
 */
export async function handleConfigButtonInteraction(
  interaction: ButtonInteraction,
  client: Client,
): Promise<void> {
  // Check if this is a config button
  if (!interaction.customId.startsWith('config_')) {
    return;
  }

  // Validate guild and member
  if (!interaction.guild || !interaction.member) {
    await interaction.reply({
      content: '❌ Cette commande ne peut être utilisée que sur un serveur.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Check permissions
  if (!hasAdminRole(interaction.member as any)) {
    await interaction.reply({
      content: '❌ Vous avez besoin des permissions administrateur pour utiliser cette commande.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Defer reply for potentially long operations
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  // Get the guild config manager
  const storage = new SqliteStorage();
  await storage.initialize();
  const configManager = new GuildConfigManager(client, storage);

  try {
    // Handle different button interactions
    switch (interaction.customId) {
      case 'config_set_channel':
        await handleChannelSelection(interaction as any, configManager, client);
        break;
      case 'config_set_roles':
        await handleRoleSelection(interaction as any, configManager, client);
        break;
      case 'config_set_timing':
        await handleIntervalSelection(interaction as any, configManager);
        break;
      case 'config_suggestions':
        await handleSuggestions(interaction, configManager);
        break;
      default:
        await interaction.editReply({
          content: '❌ Action non reconnue.',
        });
    }
  } catch (error) {
    logger.error('Error handling config button interaction:', error);
    await interaction.editReply({
      content: "❌ Une erreur s'est produite lors du traitement de l'action.",
    });
  }
}

/**
 * Handle suggestions button - show suggested configuration
 */
async function handleSuggestions(
  interaction: ButtonInteraction,
  configManager: GuildConfigManager,
): Promise<void> {
  try {
    const suggestions = await configManager.getSuggestedConfig(interaction.guildId!);

    if (Object.keys(suggestions).length === 0) {
      await interaction.editReply({
        content:
          '✨ Aucune suggestion disponible pour ce serveur. Votre configuration semble déjà optimale !',
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0x00ae86)
      .setTitle('💡 Suggestions de Configuration')
      .setDescription("Voici des suggestions basées sur l'analyse de votre serveur :")
      .setThumbnail(interaction.guild!.iconURL());

    // Add suggestions to embed
    if (suggestions.reminderChannelId && suggestions.reminderChannelName) {
      embed.addFields({
        name: '📢 Canal recommandé',
        value: `#${suggestions.reminderChannelName}`,
        inline: true,
      });
    }

    if (suggestions.adminRoleNames && suggestions.adminRoleNames.length > 0) {
      embed.addFields({
        name: '👑 Rôles administrateurs suggérés',
        value: suggestions.adminRoleNames.join(', '),
        inline: true,
      });
    }

    if (suggestions.defaultIntervalMinutes) {
      embed.addFields({
        name: '⏰ Intervalle suggéré',
        value: `${suggestions.defaultIntervalMinutes} minutes`,
        inline: true,
      });
    }

    if (suggestions.maxMentionsPerReminder) {
      embed.addFields({
        name: '📊 Limite de mentions suggérée',
        value: `${suggestions.maxMentionsPerReminder} mentions`,
        inline: true,
      });
    }

    embed.setFooter({
      text: 'Utilisez /config set pour appliquer ces suggestions',
    });

    await interaction.editReply({
      embeds: [embed],
    });
  } catch (error) {
    logger.error('Error handling suggestions:', error);
    await interaction.editReply({
      content: '❌ Impossible de charger les suggestions.',
    });
  }
}

/**
 * Discord Reminder Bot - Configuration Command Handler
 *
 * Wrapper for handleConfigSet to allow direct calls with configManager in tests
 */

export async function handleConfigSetCommand(
  interaction: ChatInputCommandInteraction,
  configManager: GuildConfigManager,
): Promise<void> {
  try {
    // If tests call this directly, ensure we defer reply similarly to command handler
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    }

    // Call internal handler; pass client from configManager if available
    const client = (configManager as any).client as Client | undefined;
    await handleConfigSet(interaction, configManager, client as any);
  } catch (error) {
    logger.error(`Error in handleConfigSetCommand: ${String(error)}`);
    try {
      if (interaction.deferred) {
        await interaction.editReply({ content: '❌ Une erreur est survenue.' });
      } else if (!interaction.replied) {
        await interaction.reply({
          content: '❌ Une erreur est survenue.',
          flags: MessageFlags.Ephemeral,
        });
      }
    } catch (replyError) {
      logger.debug('Failed to send error reply in handleConfigSetCommand:', replyError);
    }
  }
}
