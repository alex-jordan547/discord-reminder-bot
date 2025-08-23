import discord
from discord.ext import commands, tasks
import asyncio
import json
import os
from datetime import datetime, timedelta
import re

# Configuration simplifiée - SEUL LE TOKEN EST OBLIGATOIRE !
TOKEN = os.getenv('DISCORD_TOKEN')
# Support des minutes pour les tests (ex: 0.1 = 6 minutes, 0.5 = 30 minutes, 1 = 1 heure)
REMINDER_INTERVAL_HOURS = float(os.getenv('REMINDER_INTERVAL_HOURS', '24'))
REMINDER_INTERVAL_MINUTES = int(REMINDER_INTERVAL_HOURS * 60)  # Conversion en minutes pour le tasks.loop
ADMIN_ROLES = os.getenv('ADMIN_ROLES', 'Admin,Moderateur,Coach').split(',')
USE_SEPARATE_REMINDER_CHANNEL = os.getenv('USE_SEPARATE_REMINDER_CHANNEL', 'false').lower() == 'true'
REMINDER_CHANNEL_NAME = os.getenv('REMINDER_CHANNEL_NAME', 'rappels-matchs')

# Intents
intents = discord.Intents.default()
intents.message_content = True
intents.reactions = True
intents.guilds = True
intents.members = True

bot = commands.Bot(command_prefix='!', intents=intents)

# Stockage des matchs surveillés
watched_matches = {}

class MatchReminder:
    def __init__(self, message_id, channel_id, guild_id, title, required_reactions=['✅', '❌', '❓']):
        self.message_id = message_id
        self.channel_id = channel_id
        self.guild_id = guild_id
        self.title = title
        self.required_reactions = required_reactions
        self.last_reminder = datetime.now()
        self.users_who_reacted = set()
        self.all_users = set()

    def to_dict(self):
        return {
            'message_id': self.message_id,
            'channel_id': self.channel_id,
            'guild_id': self.guild_id,
            'title': self.title,
            'required_reactions': self.required_reactions,
            'last_reminder': self.last_reminder.isoformat(),
            'users_who_reacted': list(self.users_who_reacted),
            'all_users': list(self.all_users)
        }

    @classmethod
    def from_dict(cls, data):
        reminder = cls(
            data['message_id'],
            data['channel_id'],
            data.get('guild_id', 0),  # Compatibilité avec anciennes sauvegardes
            data['title'],
            data['required_reactions']
        )
        reminder.last_reminder = datetime.fromisoformat(data['last_reminder'])
        reminder.users_who_reacted = set(data['users_who_reacted'])
        reminder.all_users = set(data['all_users'])
        return reminder

def save_matches():
    """Sauvegarde les matchs surveillés dans un fichier JSON"""
    data = {str(k): v.to_dict() for k, v in watched_matches.items()}
    with open('watched_matches.json', 'w') as f:
        json.dump(data, f, indent=2)

def load_matches():
    """Charge les matchs surveillés depuis le fichier JSON"""
    global watched_matches
    try:
        with open('watched_matches.json', 'r') as f:
            data = json.load(f)
            watched_matches = {int(k): MatchReminder.from_dict(v) for k, v in data.items()}
            print(f"✅ {len(watched_matches)} matchs chargés depuis la sauvegarde")
    except FileNotFoundError:
        watched_matches = {}
        print("ℹ️ Aucune sauvegarde trouvée, démarrage avec une liste vide")

async def get_or_create_reminder_channel(guild):
    """Trouve ou crée le canal de rappels si nécessaire"""
    if not USE_SEPARATE_REMINDER_CHANNEL:
        return None
    
    # Chercher un canal existant
    for channel in guild.text_channels:
        if channel.name == REMINDER_CHANNEL_NAME:
            return channel
    
    # Créer le canal s'il n'existe pas
    try:
        channel = await guild.create_text_channel(
            name=REMINDER_CHANNEL_NAME,
            topic="📢 Canal automatique pour les rappels de disponibilités matchs"
        )
        print(f"✅ Canal #{REMINDER_CHANNEL_NAME} créé sur le serveur {guild.name}")
        return channel
    except discord.Forbidden:
        print(f"⚠️ Pas les permissions pour créer le canal #{REMINDER_CHANNEL_NAME}")
        return None

@bot.event
async def on_ready():
    print(f'✅ Bot connecté en tant que {bot.user}')
    print(f'📊 Présent sur {len(bot.guilds)} serveur(s)')
    
    for guild in bot.guilds:
        print(f'  - {guild.name} (ID: {guild.id})')
    
    load_matches()
    check_reminders.start()
    
    # Affichage plus clair de l'intervalle
    if REMINDER_INTERVAL_HOURS < 1:
        print(f'⏰ Rappels automatiques activés toutes les {REMINDER_INTERVAL_MINUTES} minutes')
    else:
        print(f'⏰ Rappels automatiques activés toutes les {REMINDER_INTERVAL_HOURS} heures')
    
    if USE_SEPARATE_REMINDER_CHANNEL:
        print(f'📢 Mode: Rappels dans un canal séparé (#{REMINDER_CHANNEL_NAME})')
    else:
        print(f'📢 Mode: Rappels dans le même canal que le match')

@bot.command(name='watch')
async def watch_match(ctx, message_link: str):
    """
    Ajoute un message de match à surveiller
    Usage: !watch [lien_du_message]
    """
    # Vérification des permissions
    has_permission = False
    if ctx.author.guild_permissions.administrator:
        has_permission = True
    else:
        for role in ctx.author.roles:
            if role.name in ADMIN_ROLES:
                has_permission = True
                break
    
    if not has_permission:
        await ctx.send(f"❌ Vous devez avoir l'un de ces rôles: {', '.join(ADMIN_ROLES)}")
        return
    
    # Extraction de l'ID du message depuis le lien
    match = re.search(r'channels/(\d+)/(\d+)/(\d+)', message_link)
    if not match:
        await ctx.send("❌ Format de lien invalide. Faites clic droit sur le message → 'Copier le lien du message'")
        return
    
    guild_id, channel_id, message_id = map(int, match.groups())
    
    # Vérification que c'est bien sur ce serveur
    if guild_id != ctx.guild.id:
        await ctx.send("❌ Ce message n'est pas sur ce serveur!")
        return
    
    # Vérification et récupération du message
    try:
        channel = bot.get_channel(channel_id)
        if not channel:
            await ctx.send("❌ Canal introuvable.")
            return
            
        message = await channel.fetch_message(message_id)
        
        # Extraction du titre (première ligne du message)
        title = message.content.split('\n')[0][:100] if message.content else f"Match #{message_id}"
        
        # Création du reminder
        reminder = MatchReminder(message_id, channel_id, guild_id, title)
        
        # Récupération de tous les membres du serveur (sauf les bots)
        guild = ctx.guild
        reminder.all_users = {member.id for member in guild.members if not member.bot}
        
        # Vérification des réactions existantes
        for reaction in message.reactions:
            if reaction.emoji in reminder.required_reactions:
                async for user in reaction.users():
                    if not user.bot:
                        reminder.users_who_reacted.add(user.id)
        
        watched_matches[message_id] = reminder
        save_matches()
        
        missing_count = len(reminder.all_users - reminder.users_who_reacted)
        
        embed = discord.Embed(
            title="✅ Match ajouté à la surveillance!",
            color=discord.Color.green(),
            timestamp=datetime.now()
        )
        embed.add_field(name="📌 Match", value=title, inline=False)
        embed.add_field(name="✅ Ont répondu", value=str(len(reminder.users_who_reacted)), inline=True)
        embed.add_field(name="❌ Manquants", value=str(missing_count), inline=True)
        embed.add_field(name="👥 Total", value=str(len(reminder.all_users)), inline=True)
        
        await ctx.send(embed=embed)
        
    except discord.NotFound:
        await ctx.send("❌ Message introuvable.")
    except Exception as e:
        await ctx.send(f"❌ Erreur: {str(e)}")

@bot.command(name='unwatch')
async def unwatch_match(ctx, message_id: int):
    """
    Retire un message de la surveillance
    Usage: !unwatch [id_message]
    """
    # Vérification des permissions
    has_permission = False
    if ctx.author.guild_permissions.administrator:
        has_permission = True
    else:
        for role in ctx.author.roles:
            if role.name in ADMIN_ROLES:
                has_permission = True
                break
    
    if not has_permission:
        await ctx.send(f"❌ Vous devez avoir l'un de ces rôles: {', '.join(ADMIN_ROLES)}")
        return
    
    if message_id in watched_matches:
        title = watched_matches[message_id].title
        del watched_matches[message_id]
        save_matches()
        await ctx.send(f"✅ Match **{title}** retiré de la surveillance.")
    else:
        await ctx.send("❌ Ce message n'est pas surveillé.")

@bot.command(name='list')
async def list_matches(ctx):
    """Liste tous les matchs surveillés sur ce serveur"""
    # Filtrer les matchs de ce serveur uniquement
    server_matches = {k: v for k, v in watched_matches.items() if v.guild_id == ctx.guild.id}
    
    if not server_matches:
        await ctx.send("📭 Aucun match surveillé sur ce serveur.")
        return
    
    embed = discord.Embed(
        title=f"📋 Matchs surveillés sur {ctx.guild.name}",
        color=discord.Color.blue(),
        timestamp=datetime.now()
    )
    
    for match_id, reminder in server_matches.items():
        missing = len(reminder.all_users - reminder.users_who_reacted)
        channel = bot.get_channel(reminder.channel_id)
        channel_mention = f"<#{reminder.channel_id}>" if channel else "Canal inconnu"
        
        embed.add_field(
            name=reminder.title[:100],
            value=f"📍 {channel_mention}\n"
                  f"✅ Réponses: {len(reminder.users_who_reacted)}/{len(reminder.all_users)}\n"
                  f"❌ Manquants: {missing}\n"
                  f"🔗 [Lien](https://discord.com/channels/{reminder.guild_id}/{reminder.channel_id}/{match_id})",
            inline=False
        )
    
    embed.set_footer(text=f"Total: {len(server_matches)} match(s) surveillé(s)")
    await ctx.send(embed=embed)

@bot.command(name='remind')
async def manual_remind(ctx, message_id: int = None):
    """
    Envoie un rappel manuel pour un match ou tous les matchs du serveur
    Usage: !remind [id_message_optionnel]
    """
    # Vérification des permissions
    has_permission = False
    if ctx.author.guild_permissions.administrator:
        has_permission = True
    else:
        for role in ctx.author.roles:
            if role.name in ADMIN_ROLES:
                has_permission = True
                break
    
    if not has_permission:
        await ctx.send(f"❌ Vous devez avoir l'un de ces rôles: {', '.join(ADMIN_ROLES)}")
        return
    
    if message_id:
        if message_id not in watched_matches:
            await ctx.send("❌ Ce message n'est pas surveillé.")
            return
        if watched_matches[message_id].guild_id != ctx.guild.id:
            await ctx.send("❌ Ce match n'est pas sur ce serveur.")
            return
        matches_to_remind = {message_id: watched_matches[message_id]}
    else:
        # Filtrer uniquement les matchs de ce serveur
        matches_to_remind = {k: v for k, v in watched_matches.items() if v.guild_id == ctx.guild.id}
    
    if not matches_to_remind:
        await ctx.send("📭 Aucun match à rappeler sur ce serveur.")
        return
    
    # Déterminer où envoyer les rappels
    reminder_channel = await get_or_create_reminder_channel(ctx.guild) if USE_SEPARATE_REMINDER_CHANNEL else None
    
    total_reminded = 0
    
    for match_id, reminder in matches_to_remind.items():
        # Si pas de canal séparé, utiliser le canal du match
        if not reminder_channel:
            reminder_channel = bot.get_channel(reminder.channel_id)
        
        if reminder_channel:
            count = await send_reminder(reminder, reminder_channel)
            total_reminded += count
    
    await ctx.send(f"✅ Rappel envoyé! {total_reminded} personne(s) notifiée(s) au total.")

async def send_reminder(reminder, channel):
    """Envoie un rappel pour un match spécifique"""
    try:
        # Mise à jour des réactions
        match_channel = bot.get_channel(reminder.channel_id)
        if not match_channel:
            return 0
            
        message = await match_channel.fetch_message(reminder.message_id)
        
        reminder.users_who_reacted.clear()
        for reaction in message.reactions:
            if reaction.emoji in reminder.required_reactions:
                async for user in reaction.users():
                    if not user.bot:
                        reminder.users_who_reacted.add(user.id)
        
        # Identification des utilisateurs manquants
        missing_users = reminder.all_users - reminder.users_who_reacted
        
        if not missing_users:
            return 0
        
        # Limiter à 50 mentions maximum pour éviter le spam
        users_to_mention = list(missing_users)[:50]
        remaining = len(missing_users) - len(users_to_mention)
        
        # Construction du message de rappel
        mentions = ' '.join([f'<@{user_id}>' for user_id in users_to_mention])
        
        embed = discord.Embed(
            title=f"🔔 Rappel: {reminder.title[:100]}",
            description=f"**Merci de mettre votre disponibilité pour le match!**\n"
                       f"Réagissez avec ✅ (dispo), ❌ (pas dispo) ou ❓ (incertain)",
            color=discord.Color.orange(),
            timestamp=datetime.now()
        )
        
        embed.add_field(
            name="📊 Statistiques",
            value=f"✅ Ont répondu: **{len(reminder.users_who_reacted)}**\n"
                  f"❌ Manquants: **{len(missing_users)}**\n"
                  f"👥 Total joueurs: **{len(reminder.all_users)}**",
            inline=False
        )
        
        embed.add_field(
            name="🔗 Lien vers le match",
            value=f"[**Cliquez ici pour voir le message**](https://discord.com/channels/{reminder.guild_id}/{reminder.channel_id}/{reminder.message_id})",
            inline=False
        )
        
        if remaining > 0:
            embed.set_footer(text=f"⚠️ +{remaining} autres personnes non mentionnées (limite Discord)")
        
        # Envoi du rappel
        await channel.send(content=mentions, embed=embed)
        
        reminder.last_reminder = datetime.now()
        save_matches()
        
        return len(users_to_mention)
        
    except Exception as e:
        print(f"❌ Erreur lors de l'envoi du rappel: {str(e)}")
        return 0

@tasks.loop(minutes=REMINDER_INTERVAL_MINUTES)
async def check_reminders():
    """Vérifie et envoie les rappels automatiques"""
    if not watched_matches:
        return
    
    total_reminded = 0
    
    for reminder in watched_matches.values():
        # Vérifier si assez de temps s'est écoulé depuis le dernier rappel
        time_since_last = datetime.now() - reminder.last_reminder
        if time_since_last >= timedelta(minutes=REMINDER_INTERVAL_MINUTES - 1):
            # Trouver le serveur et le canal approprié
            guild = bot.get_guild(reminder.guild_id)
            if not guild:
                continue
            
            # Déterminer où envoyer le rappel
            if USE_SEPARATE_REMINDER_CHANNEL:
                reminder_channel = await get_or_create_reminder_channel(guild)
            else:
                reminder_channel = bot.get_channel(reminder.channel_id)
            
            if reminder_channel:
                count = await send_reminder(reminder, reminder_channel)
                total_reminded += count
                await asyncio.sleep(2)  # Pause entre les rappels
    
    if total_reminded > 0:
        print(f"✅ Rappels automatiques envoyés: {total_reminded} personnes notifiées")

@bot.event
async def on_reaction_add(reaction, user):
    """Met à jour la liste des utilisateurs ayant réagi"""
    if user.bot:
        return
    
    message_id = reaction.message.id
    if message_id in watched_matches:
        reminder = watched_matches[message_id]
        if reaction.emoji in reminder.required_reactions:
            reminder.users_who_reacted.add(user.id)
            save_matches()

@bot.event
async def on_reaction_remove(reaction, user):
    """Met à jour la liste quand une réaction est retirée"""
    if user.bot:
        return
    
    message_id = reaction.message.id
    if message_id in watched_matches:
        reminder = watched_matches[message_id]
        # Vérifier si l'utilisateur a encore une réaction valide
        has_valid_reaction = False
        for r in reaction.message.reactions:
            if r.emoji in reminder.required_reactions:
                users = [u async for u in r.users()]
                if user in users:
                    has_valid_reaction = True
                    break
        
        if not has_valid_reaction:
            reminder.users_who_reacted.discard(user.id)
            save_matches()

@bot.command(name='config')
async def show_config(ctx):
    """Affiche la configuration actuelle du bot"""
    embed = discord.Embed(
        title="⚙️ Configuration actuelle",
        color=discord.Color.blue(),
        timestamp=datetime.now()
    )
    
    mode = "Canal séparé" if USE_SEPARATE_REMINDER_CHANNEL else "Même canal que le match"
    embed.add_field(name="📢 Mode de rappel", value=mode, inline=False)
    
    if USE_SEPARATE_REMINDER_CHANNEL:
        embed.add_field(name="📍 Nom du canal", value=f"#{REMINDER_CHANNEL_NAME}", inline=False)
    
    # Affichage intelligent de l'intervalle
    if REMINDER_INTERVAL_HOURS < 1:
        interval_text = f"{REMINDER_INTERVAL_MINUTES} minutes"
    else:
        interval_text = f"{REMINDER_INTERVAL_HOURS} heures"
    
    embed.add_field(name="⏰ Intervalle", value=interval_text, inline=True)
    embed.add_field(name="👮 Rôles admin", value=', '.join(ADMIN_ROLES), inline=True)
    embed.add_field(name="📊 Matchs surveillés", value=str(len([m for m in watched_matches.values() if m.guild_id == ctx.guild.id])), inline=True)
    
    await ctx.send(embed=embed)

@bot.command(name='help_reminder')
async def help_command(ctx):
    """Affiche l'aide du bot"""
    embed = discord.Embed(
        title="📚 Aide - Bot Reminder Disponibilités",
        description="Bot pour rappeler aux joueurs de mettre leurs disponibilités",
        color=discord.Color.green()
    )
    
    embed.add_field(
        name="!watch [lien_message]",
        value="Ajoute un match à surveiller\n"
              "→ Faites clic droit sur le message → 'Copier le lien'",
        inline=False
    )
    
    embed.add_field(
        name="!unwatch [id_message]",
        value="Retire un match de la surveillance",
        inline=False
    )
    
    embed.add_field(
        name="!list",
        value="Liste tous les matchs surveillés sur ce serveur",
        inline=False
    )
    
    embed.add_field(
        name="!remind [id_message]",
        value="Envoie un rappel manuel (optionnel: pour un match spécifique)",
        inline=False
    )
    
    embed.add_field(
        name="!config",
        value="Affiche la configuration actuelle",
        inline=False
    )
    
    embed.add_field(
        name="!help_reminder",
        value="Affiche cette aide",
        inline=False
    )
    
    embed.set_footer(text=f"Préfixe: ! | Rôles admin: {', '.join(ADMIN_ROLES)}")
    
    await ctx.send(embed=embed)

# Lancement du bot
if __name__ == "__main__":
    if not TOKEN:
        print("❌ Token Discord manquant! Définissez la variable DISCORD_TOKEN")
        print("📖 Guide: https://discord.com/developers/applications")
    else:
        print("🚀 Démarrage du bot...")
        bot.run(TOKEN)