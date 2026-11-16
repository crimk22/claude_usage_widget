/**
 * i18n.js — French / English strings and locale-aware formatting.
 * Loaded by the main process (require) and by both windows (<script>).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.I18n = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const fr = {
    'app.name': 'AI Usage',
    'app.footer': '100 % local · aucun réseau · {time}',
    'btn.dashboard': 'Tableau de bord',
    'btn.refresh': 'Actualiser',
    'btn.hide': 'Masquer',
    'btn.quit': 'Quitter',

    'tag.plan': 'équiv. API',
    'tag.api': 'facturé',
    'bar.session': 'Session (5 h)',
    'bar.week': 'Semaine (7 j)',
    'bar.month': 'Mois ({n} j)',
    'bar.limit': 'Limite',
    'bar.sessionH': 'Session ({n} h)',
    'bar.weekD': 'Semaine ({n} j)',
    'bar.pace': 'Rythme régulier',
    'bar.estimated': 'Estimation : dernier relevé officiel {official} % + activité locale depuis',
    'reset.done': 'réinitialisé',
    'reset.in': 'reset dans {left} · {when}',
    'reset.stale': 'fenêtre réinitialisée depuis le dernier relevé',
    'ago.now': 'à l’instant',
    'ago.min': 'il y a {n} min',
    'ago.hour': 'il y a {n} h',
    'ago.day': 'il y a {n} j',
    'unit.day': 'j',
    'unit.hour': 'h',
    'unit.min': 'min',
    'unit.tok': 'tok',

    'forecast.limit': 'limite atteinte',
    'forecast.hit': 'limite vers {time} à ce rythme',
    'forecast.ok': 'rythme OK · ~{pct} % au reset',
    'forecast.budget': 'budget du jour : {pct} % pour tenir la semaine',
    'forecast.weekHit': 'limite hebdo vers {time} à ce rythme',

    'cost.today': 'Aujourd’hui',
    'cost.week': '7 jours',
    'cost.month': 'Ce mois',
    'cost.total': 'Claude · total du mois (estimé)',
    'meta.quota': 'quota relevé {ago}',
    'meta.activity': 'dernière activité {ago}',
    'meta.unpriced': '{n} modèle(s) sans tarif : coût sous-estimé',
    'quota.none': 'Quota : pas encore de relevé',
    'quota.enable': 'Activer le relevé du quota',
    'quota.open': 'Quota : ouvrez une session Claude Code sur ce profil',
    'quota.noLimits': 'Quota : Claude Code n’en transmet pas pour ce profil',
    'codex.none': 'Aucune donnée Codex trouvée',
    'codex.measured': 'relevé {ago} (dernière requête Codex)',
    'profile.none': 'Aucun profil Claude Code trouvé sur ce PC',

    'tray.toggle': 'Afficher / masquer',
    'tray.dashboard': 'Tableau de bord',
    'tray.refresh': 'Actualiser',
    'tray.quit': 'Quitter',

    'alert.title': 'AI Usage',
    'alert.warn': '{scope} : {pct} % utilisés',
    'alert.danger': '{scope} : {pct} % utilisés, bientôt épuisé',
    'alert.forecast': 'À ce rythme, la limite de session sera atteinte vers {time}',
    'alert.reset': 'Session réinitialisée : vous pouvez relancer',
    'alert.scope.session': 'Session',
    'alert.scope.weekly': 'Semaine',

    'tab.overview': 'Vue d’ensemble',
    'tab.projects': 'Projets',
    'tab.models': 'Modèles',
    'tab.habits': 'Habitudes',
    'tab.history': 'Historique',
    'tab.tips': 'Conseils',
    'tab.settings': 'Réglages',
    'dash.title': 'AI Usage · tableau de bord',
    'dash.local': 'Chiffres issus des journaux locaux de Claude Code et Codex. Aucun réseau.',
    'dash.profile': 'Profil',
    'dash.loading': 'Lecture des journaux…',
    'dash.empty': 'Pas encore de données pour ce profil.',

    'ov.month': 'Mois en cours (estimé)',
    'ov.today': 'Aujourd’hui',
    'ov.messages': 'Réponses ce mois',
    'ov.topProject': 'Premier projet',
    'ov.daily': 'Coût estimé par jour, 30 derniers jours',
    'ov.active': 'Sessions actives (15 dernières minutes)',
    'ov.noActive': 'Aucune session active.',
    'ov.context': 'contexte {n}',
    'ov.contextHigh': 'contexte chargé : pensez à /compact',
    'ov.burn': '{n} tok/min en sortie',
    'ov.quota': 'Quotas',
    'ov.equiv': 'Pour un forfait, ces montants sont un équivalent au tarif public de l’API, pas ce que vous payez.',

    'col.project': 'Projet',
    'col.model': 'Modèle',
    'col.cost': 'Coût estimé',
    'col.share': 'Part',
    'col.tokens': 'Tokens',
    'col.messages': 'Réponses',
    'col.last': 'Dernière activité',
    'col.time': 'Relevé',
    'col.day': 'Jour',
    'col.unpriced': 'sans tarif',
    'table.period': 'Mois en cours',

    'habits.title': 'Quand vous consommez (28 derniers jours, coût estimé)',
    'habits.less': 'moins',
    'habits.more': 'plus',
    'habits.peak': 'Créneau le plus chargé : {day} vers {hour} h.',
    'habits.empty': 'Pas assez d’activité pour dessiner la carte.',
    'day.0': 'lun.', 'day.1': 'mar.', 'day.2': 'mer.', 'day.3': 'jeu.', 'day.4': 'ven.', 'day.5': 'sam.', 'day.6': 'dim.',
    'dayLong.0': 'lundi', 'dayLong.1': 'mardi', 'dayLong.2': 'mercredi', 'dayLong.3': 'jeudi',
    'dayLong.4': 'vendredi', 'dayLong.5': 'samedi', 'dayLong.6': 'dimanche',

    'hist.title': 'Relevés officiels du quota',
    'hist.24h': '24 h', 'hist.7d': '7 j', 'hist.30d': '30 j', 'hist.90d': '90 j',
    'hist.table': 'Tableau',
    'hist.chart': 'Graphique',
    'hist.empty': 'L’historique se remplit à chaque relevé officiel. Revenez après quelques sessions Claude Code.',
    'hist.peakSession': 'Pic session',
    'hist.peakWeekly': 'Pic hebdo',
    'hist.hot': 'Sessions au-delà de {pct} %',
    'hist.api': 'Un profil facturé à l’usage n’a pas de quota.',
    'export.csv': 'Exporter CSV',
    'export.done': 'Exporté',
    'export.report': 'Générer le rapport',
    'export.reportHint': 'Page HTML autonome, enregistrée où vous voulez.',

    'tips.title': 'Conseils calculés localement',
    'tips.none': 'Rien à signaler pour l’instant.',
    'tips.level.action': 'À traiter',
    'tips.level.info': 'À savoir',
    'tips.level.good': 'Bien',
    'tip.unpriced.title': 'Modèles sans tarif',
    'tip.unpriced.text': '{n} réponses de {models} sont comptées à 0 $. Ajoutez ces modèles à la grille de tarifs (Réglages) pour un coût juste.',
    'tip.relayMissing.title': 'Quota officiel non relevé',
    'tip.relayMissing.text': 'Installez le relais dans Réglages : le widget affichera alors les pourcentages officiels de session et de semaine.',
    'tip.relayForeign.title': 'Votre status line ne transmet pas le quota',
    'tip.relayForeign.text': 'Une status line personnalisée est en place. Ajoutez-y les deux lignes proposées dans Réglages pour que le widget lise le quota.',
    'tip.noRateLimits.title': 'Pas de quota transmis',
    'tip.noRateLimits.text': 'Le relais fonctionne, mais Claude Code n’envoie pas de quota pour ce profil (clé API, ou forfait qui n’en fournit pas).',
    'tip.topTierShort.title': 'Modèle haut de gamme sur des tâches courtes',
    'tip.topTierShort.text': '{share} % du coût vient des modèles les plus chers, et {short} % de leurs réponses font moins de 300 tokens. Un modèle plus léger sur ces tâches préserverait le quota.',
    'tip.bigContext.title': 'Contextes très chargés',
    'tip.bigContext.text': '{share} % des réponses relisent plus de 150 000 tokens de contexte. Utilisez /compact ou ouvrez une nouvelle session plus tôt.',
    'tip.lowCache.title': 'Cache peu exploité',
    'tip.lowCache.text': 'Seulement {rate} % du contexte est relu depuis le cache. Des sessions très courtes ou très espacées en sont souvent la cause.',
    'tip.goodCache.title': 'Cache bien exploité',
    'tip.goodCache.text': '{rate} % du contexte est relu depuis le cache.',
    'tip.oneProject.title': 'Un projet concentre l’usage',
    'tip.oneProject.text': '{project} représente {share} % du coût estimé du mois.',
    'tip.peakSlot.title': 'Créneau de pointe',
    'tip.peakSlot.text': '{share} % de la consommation se concentre le {day} vers {hour} h. Évitez d’y lancer une grosse tâche si la session est déjà entamée.',
    'tip.planTooSmall.title': 'Forfait souvent saturé',
    'tip.planTooSmall.text': '{hot} sessions sur {total} ont dépassé {pct} %. Un forfait supérieur, ou un report des tâches lourdes, éviterait les blocages.',
    'tip.planTooLarge.title': 'Forfait largement dimensionné',
    'tip.planTooLarge.text': 'Sur les trois dernières semaines, le quota hebdo n’a pas dépassé {peak} %. D’après ce PC seulement : vérifiez l’usage sur claude.ai avant de réduire le forfait.',

    'set.profiles': 'Profils Claude Code',
    'set.profilesHint': 'Un profil = un dossier de configuration (~/.claude, ~/.claude-nom). Sans profil déclaré, ils sont détectés automatiquement.',
    'set.auto': 'détecté automatiquement',
    'set.name': 'Nom',
    'set.kind.plan': 'Forfait',
    'set.kind.api': 'API (facturé)',
    'set.add': 'Ajouter un dossier…',
    'set.remove': 'Retirer',
    'set.autoDetect': 'Revenir à la détection automatique',
    'set.relay': 'Relevé du quota',
    'set.relay.none': 'non installé',
    'set.relay.ours': 'installé',
    'set.relay.oursChained': 'installé, votre status line est conservée',
    'set.relay.foreign': 'status line personnalisée en place',
    'set.relay.unreadable': 'settings.json illisible : rien ne sera modifié',
    'set.relay.last': 'dernier relevé {ago}',
    'set.relay.never': 'aucun relevé pour l’instant',
    'set.relay.install': 'Installer',
    'set.relay.uninstall': 'Désinstaller',
    'set.relay.snippet': 'Ajoutez ces lignes à votre script de status line, après la lecture de l’entrée :',
    'set.relay.explain': 'Le relais copie dans un fichier local ce que Claude Code transmet à la status line. Votre settings.json est sauvegardé avant toute modification.',
    'set.relay.failed': 'Installation impossible : rien n’a été modifié.',
    'set.display': 'Affichage',
    'set.theme': 'Thème',
    'set.theme.dark': 'Sombre', 'set.theme.light': 'Clair', 'set.theme.system': 'Système',
    'set.language': 'Langue',
    'set.language.auto': 'Système',
    'set.alwaysOnTop': 'Widget toujours au premier plan',
    'set.trayPercent': 'Pourcentage dans l’icône de la barre système',
    'set.showCosts': 'Afficher les coûts estimés dans le widget',
    'set.showCodex': 'Afficher Codex',
    'set.autoStart': 'Lancer au démarrage',
    'set.shortcut': 'Raccourci afficher / masquer',
    'set.shortcut.off': 'Désactivé',
    'set.alerts': 'Alertes',
    'set.alertsOn': 'Notifications (seuils, limite prévue, session réinitialisée)',
    'set.warn': 'Seuil d’avertissement',
    'set.danger': 'Seuil critique',
    'set.pricing': 'Grille de tarifs',
    'set.pricing.bundled': 'grille fournie avec l’application',
    'set.pricing.user': 'votre copie',
    'set.pricing.env': 'fichier désigné par AI_USAGE_PRICING',
    'set.pricing.edit': 'Créer / ouvrir ma copie',
    'set.pricing.reload': 'Recharger',
    'set.pricing.hint': 'Prix publics de l’API en dollars par million de tokens. À vérifier et à tenir à jour vous-même.',
    'set.report': 'Rapport mensuel',
    'set.report.current': 'Mois en cours',
    'set.saved': 'Enregistré',
    'set.privacy': 'Lecture seule des compteurs (heure, modèle, tokens, dossier). Le texte des conversations n’est jamais lu ni conservé.',

    'report.title': 'Rapport d’usage IA',
    'report.period': 'Période : {from} au {to}',
    'report.generated': 'Généré localement le {date} par AI Usage Widget. Coûts estimés au tarif public de l’API ; pour un forfait, c’est un équivalent, pas une facture. Périmètre : Claude Code sur ce poste.',
    'report.total': 'Total estimé',
    'report.profiles': 'Profils',
    'report.topProjects': 'Projets',
    'report.models': 'Modèles',
    'report.daily': 'Coût estimé par jour',
    'report.tips': 'Conseils',
    'report.quota': 'Quota : pic session {s} %, pic hebdo {w} %, {hot} session(s) au-delà de {pct} %',
    'report.noData': 'Aucune activité sur la période.'
  };

  const en = {
    'app.name': 'AI Usage',
    'app.footer': '100% local · no network · {time}',
    'btn.dashboard': 'Dashboard',
    'btn.refresh': 'Refresh',
    'btn.hide': 'Hide',
    'btn.quit': 'Quit',

    'tag.plan': 'API equiv.',
    'tag.api': 'billed',
    'bar.session': 'Session (5 h)',
    'bar.week': 'Week (7 d)',
    'bar.month': 'Month ({n} d)',
    'bar.limit': 'Limit',
    'bar.sessionH': 'Session ({n} h)',
    'bar.weekD': 'Week ({n} d)',
    'bar.pace': 'Even pace',
    'bar.estimated': 'Estimate: last official reading {official}% + local activity since',
    'reset.done': 'reset',
    'reset.in': 'resets in {left} · {when}',
    'reset.stale': 'window has reset since the last reading',
    'ago.now': 'just now',
    'ago.min': '{n} min ago',
    'ago.hour': '{n} h ago',
    'ago.day': '{n} d ago',
    'unit.day': 'd',
    'unit.hour': 'h',
    'unit.min': 'min',
    'unit.tok': 'tok',

    'forecast.limit': 'limit reached',
    'forecast.hit': 'limit around {time} at this pace',
    'forecast.ok': 'on track · ~{pct}% at reset',
    'forecast.budget': 'today’s budget: {pct}% to last the week',
    'forecast.weekHit': 'weekly limit around {time} at this pace',

    'cost.today': 'Today',
    'cost.week': '7 days',
    'cost.month': 'This month',
    'cost.total': 'Claude · month total (estimated)',
    'meta.quota': 'quota read {ago}',
    'meta.activity': 'last activity {ago}',
    'meta.unpriced': '{n} model(s) without a price: cost underestimated',
    'quota.none': 'Quota: no reading yet',
    'quota.enable': 'Enable quota readings',
    'quota.open': 'Quota: open a Claude Code session on this profile',
    'quota.noLimits': 'Quota: Claude Code sends none for this profile',
    'codex.none': 'No Codex data found',
    'codex.measured': 'read {ago} (last Codex request)',
    'profile.none': 'No Claude Code profile found on this PC',

    'tray.toggle': 'Show / hide',
    'tray.dashboard': 'Dashboard',
    'tray.refresh': 'Refresh',
    'tray.quit': 'Quit',

    'alert.title': 'AI Usage',
    'alert.warn': '{scope}: {pct}% used',
    'alert.danger': '{scope}: {pct}% used, running low',
    'alert.forecast': 'At this pace the session limit will be reached around {time}',
    'alert.reset': 'Session has reset: you can start again',
    'alert.scope.session': 'Session',
    'alert.scope.weekly': 'Week',

    'tab.overview': 'Overview',
    'tab.projects': 'Projects',
    'tab.models': 'Models',
    'tab.habits': 'Habits',
    'tab.history': 'History',
    'tab.tips': 'Tips',
    'tab.settings': 'Settings',
    'dash.title': 'AI Usage · dashboard',
    'dash.local': 'Figures come from local Claude Code and Codex logs. No network.',
    'dash.profile': 'Profile',
    'dash.loading': 'Reading logs…',
    'dash.empty': 'No data for this profile yet.',

    'ov.month': 'Month to date (estimated)',
    'ov.today': 'Today',
    'ov.messages': 'Replies this month',
    'ov.topProject': 'Top project',
    'ov.daily': 'Estimated cost per day, last 30 days',
    'ov.active': 'Active sessions (last 15 minutes)',
    'ov.noActive': 'No active session.',
    'ov.context': 'context {n}',
    'ov.contextHigh': 'heavy context: consider /compact',
    'ov.burn': '{n} output tok/min',
    'ov.quota': 'Quotas',
    'ov.equiv': 'For a subscription these amounts are an equivalent at public API prices, not what you pay.',

    'col.project': 'Project',
    'col.model': 'Model',
    'col.cost': 'Estimated cost',
    'col.share': 'Share',
    'col.tokens': 'Tokens',
    'col.messages': 'Replies',
    'col.last': 'Last activity',
    'col.time': 'Reading',
    'col.day': 'Day',
    'col.unpriced': 'no price',
    'table.period': 'Month to date',

    'habits.title': 'When you use it (last 28 days, estimated cost)',
    'habits.less': 'less',
    'habits.more': 'more',
    'habits.peak': 'Busiest slot: {day} around {hour}:00.',
    'habits.empty': 'Not enough activity to draw the map.',
    'day.0': 'Mon', 'day.1': 'Tue', 'day.2': 'Wed', 'day.3': 'Thu', 'day.4': 'Fri', 'day.5': 'Sat', 'day.6': 'Sun',
    'dayLong.0': 'Monday', 'dayLong.1': 'Tuesday', 'dayLong.2': 'Wednesday', 'dayLong.3': 'Thursday',
    'dayLong.4': 'Friday', 'dayLong.5': 'Saturday', 'dayLong.6': 'Sunday',

    'hist.title': 'Official quota readings',
    'hist.24h': '24 h', 'hist.7d': '7 d', 'hist.30d': '30 d', 'hist.90d': '90 d',
    'hist.table': 'Table',
    'hist.chart': 'Chart',
    'hist.empty': 'History fills up with each official reading. Come back after a few Claude Code sessions.',
    'hist.peakSession': 'Session peak',
    'hist.peakWeekly': 'Weekly peak',
    'hist.hot': 'Sessions above {pct}%',
    'hist.api': 'A pay-per-use profile has no quota.',
    'export.csv': 'Export CSV',
    'export.done': 'Exported',
    'export.report': 'Generate report',
    'export.reportHint': 'Self-contained HTML page, saved wherever you choose.',

    'tips.title': 'Tips computed locally',
    'tips.none': 'Nothing to report for now.',
    'tips.level.action': 'To do',
    'tips.level.info': 'Good to know',
    'tips.level.good': 'Good',
    'tip.unpriced.title': 'Models without a price',
    'tip.unpriced.text': '{n} replies from {models} are counted at $0. Add these models to the price table (Settings) for an accurate cost.',
    'tip.relayMissing.title': 'Official quota not read',
    'tip.relayMissing.text': 'Install the relay in Settings: the widget will then show the official session and weekly percentages.',
    'tip.relayForeign.title': 'Your status line does not pass the quota on',
    'tip.relayForeign.text': 'A custom status line is in place. Add the two lines shown in Settings so the widget can read the quota.',
    'tip.noRateLimits.title': 'No quota provided',
    'tip.noRateLimits.text': 'The relay works, but Claude Code sends no quota for this profile (API key, or a plan that does not provide one).',
    'tip.topTierShort.title': 'Top-tier model on short tasks',
    'tip.topTierShort.text': '{share}% of the cost comes from the most expensive models, and {short}% of their replies are under 300 tokens. A lighter model for those tasks would save quota.',
    'tip.bigContext.title': 'Very heavy contexts',
    'tip.bigContext.text': '{share}% of replies re-read more than 150,000 tokens of context. Use /compact or start a new session earlier.',
    'tip.lowCache.title': 'Cache underused',
    'tip.lowCache.text': 'Only {rate}% of the context is read from cache. Very short or widely spaced sessions are a common cause.',
    'tip.goodCache.title': 'Cache well used',
    'tip.goodCache.text': '{rate}% of the context is read from cache.',
    'tip.oneProject.title': 'One project dominates usage',
    'tip.oneProject.text': '{project} accounts for {share}% of this month’s estimated cost.',
    'tip.peakSlot.title': 'Peak slot',
    'tip.peakSlot.text': '{share}% of usage falls on {day} around {hour}:00. Avoid starting a large task then if the session is already well used.',
    'tip.planTooSmall.title': 'Plan often saturated',
    'tip.planTooSmall.text': '{hot} of {total} sessions went past {pct}%. A higher plan, or moving heavy tasks, would avoid interruptions.',
    'tip.planTooLarge.title': 'Plan generously sized',
    'tip.planTooLarge.text': 'Over the last three weeks the weekly quota never exceeded {peak}%. Based on this PC only: check claude.ai usage before downgrading.',

    'set.profiles': 'Claude Code profiles',
    'set.profilesHint': 'A profile = a configuration folder (~/.claude, ~/.claude-name). With no declared profile they are detected automatically.',
    'set.auto': 'detected automatically',
    'set.name': 'Name',
    'set.kind.plan': 'Subscription',
    'set.kind.api': 'API (billed)',
    'set.add': 'Add a folder…',
    'set.remove': 'Remove',
    'set.autoDetect': 'Back to automatic detection',
    'set.relay': 'Quota readings',
    'set.relay.none': 'not installed',
    'set.relay.ours': 'installed',
    'set.relay.oursChained': 'installed, your status line is kept',
    'set.relay.foreign': 'custom status line in place',
    'set.relay.unreadable': 'settings.json unreadable: nothing will be changed',
    'set.relay.last': 'last reading {ago}',
    'set.relay.never': 'no reading yet',
    'set.relay.install': 'Install',
    'set.relay.uninstall': 'Uninstall',
    'set.relay.snippet': 'Add these lines to your status line script, after it reads its input:',
    'set.relay.explain': 'The relay copies to a local file what Claude Code passes to the status line. Your settings.json is backed up before any change.',
    'set.relay.failed': 'Could not install: nothing was changed.',
    'set.display': 'Display',
    'set.theme': 'Theme',
    'set.theme.dark': 'Dark', 'set.theme.light': 'Light', 'set.theme.system': 'System',
    'set.language': 'Language',
    'set.language.auto': 'System',
    'set.alwaysOnTop': 'Keep the widget on top',
    'set.trayPercent': 'Percentage in the tray icon',
    'set.showCosts': 'Show estimated costs in the widget',
    'set.showCodex': 'Show Codex',
    'set.autoStart': 'Launch at startup',
    'set.shortcut': 'Show / hide shortcut',
    'set.shortcut.off': 'Off',
    'set.alerts': 'Alerts',
    'set.alertsOn': 'Notifications (thresholds, forecast limit, session reset)',
    'set.warn': 'Warning threshold',
    'set.danger': 'Critical threshold',
    'set.pricing': 'Price table',
    'set.pricing.bundled': 'table shipped with the app',
    'set.pricing.user': 'your copy',
    'set.pricing.env': 'file named by AI_USAGE_PRICING',
    'set.pricing.edit': 'Create / open my copy',
    'set.pricing.reload': 'Reload',
    'set.pricing.hint': 'Public API prices in dollars per million tokens. Check them and keep them up to date yourself.',
    'set.report': 'Monthly report',
    'set.report.current': 'Month to date',
    'set.saved': 'Saved',
    'set.privacy': 'Counters are read-only (time, model, tokens, folder). Conversation text is never read or kept.',

    'report.title': 'AI usage report',
    'report.period': 'Period: {from} to {to}',
    'report.generated': 'Generated locally on {date} by AI Usage Widget. Costs estimated at public API prices; for a subscription this is an equivalent, not an invoice. Scope: Claude Code on this machine.',
    'report.total': 'Estimated total',
    'report.profiles': 'Profiles',
    'report.topProjects': 'Projects',
    'report.models': 'Models',
    'report.daily': 'Estimated cost per day',
    'report.tips': 'Tips',
    'report.quota': 'Quota: session peak {s}%, weekly peak {w}%, {hot} session(s) above {pct}%',
    'report.noData': 'No activity over the period.'
  };

  const STRINGS = { fr, en };
  const SUPPORTED = Object.keys(STRINGS);
  const LOCALE = { fr: 'fr-FR', en: 'en-US' };

  /** 'auto' + a system locale such as 'fr-FR' -> 'fr'; anything unknown -> 'en'. */
  function resolveLanguage(setting, systemLocale) {
    if (SUPPORTED.includes(setting)) return setting;
    const base = String(systemLocale || '').toLowerCase().split(/[-_]/)[0];
    return SUPPORTED.includes(base) ? base : 'en';
  }

  function t(lang, key, vars) {
    let text = (STRINGS[lang] || en)[key];
    if (text == null) text = en[key];
    if (text == null) return key;
    return vars ? text.replace(/\{(\w+)\}/g, (m, name) => (vars[name] != null ? String(vars[name]) : m)) : text;
  }

  const fmt = (lang, opts) => new Intl.DateTimeFormat(LOCALE[lang] || LOCALE.en, opts);
  const time = (ms, lang) => fmt(lang, { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms));
  const date = (ms, lang) => fmt(lang, { day: 'numeric', month: 'short' }).format(new Date(ms));
  const dateLong = (ms, lang) => fmt(lang, { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(ms));
  const dayTime = (ms, lang) =>
    fmt(lang, { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms));

  /** Clock time today, weekday + time otherwise. */
  function when(ms, now, lang) {
    return new Date(ms).toDateString() === new Date(now).toDateString() ? time(ms, lang) : dayTime(ms, lang);
  }

  function ago(ms, now, lang) {
    if (!ms) return '';
    const m = Math.round((now - ms) / 60000);
    if (m < 1) return t(lang, 'ago.now');
    if (m < 60) return t(lang, 'ago.min', { n: m });
    const h = Math.round(m / 60);
    if (h < 48) return t(lang, 'ago.hour', { n: h });
    return t(lang, 'ago.day', { n: Math.round(h / 24) });
  }

  function left(ms, lang) {
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const days = Math.floor(h / 24);
    if (days >= 1) return `${days} ${t(lang, 'unit.day')} ${h % 24} ${t(lang, 'unit.hour')}`;
    if (h >= 1) return `${h} ${t(lang, 'unit.hour')} ${String(m).padStart(2, '0')}`;
    return `${m} ${t(lang, 'unit.min')}`;
  }

  const sep = (lang) => (lang === 'fr' ? ',' : '.');
  function tokens(n, lang) {
    if (n >= 1e9) return `${(n / 1e9).toFixed(1).replace('.', sep(lang))} G`;
    if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace('.', sep(lang))} M`;
    if (n >= 1e3) return `${Math.round(n / 1e3)} k`;
    return String(Math.round(n));
  }
  const usd = (n) => (n >= 100 ? `$${n.toFixed(0)}` : `$${n.toFixed(2)}`);
  const pct = (n, lang) => `${Math.round(n)}${lang === 'fr' ? ' %' : '%'}`;

  return { STRINGS, SUPPORTED, resolveLanguage, t, time, date, dateLong, dayTime, when, ago, left, tokens, usd, pct };
});
