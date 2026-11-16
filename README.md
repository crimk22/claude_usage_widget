# AI Usage Widget

Petit widget Windows, toujours au premier plan, qui affiche votre consommation **Claude** et **Codex (OpenAI)**.

**100 % local** : il lit uniquement des fichiers déjà présents sur votre PC. Aucun identifiant, aucun cookie, aucun appel réseau (toutes les requêtes sont bloquées dans `main.js`).

## Ce qu'il affiche

| Fournisseur | Donnée | Source locale | Fraîcheur |
|---|---|---|---|
| Claude | % officiel session 5 h et semaine 7 j | `~/.claude/rate-limits.json` (écrit par votre status line Claude Code, voir plus bas) | À chaque réponse de Claude Code |
| Claude | Tokens consommés (session, 7 j) | `~/.claude/projects/**/*.jsonl` | Toutes les 30 s |
| Codex | % officiel de la limite + date de reset | `~/.codex/sessions/**/*.jsonl` (événements `token_count`) | À la dernière requête Codex |

Le trait blanc sur une barre marque le rythme régulier : si la barre le dépasse, vous consommez plus vite que la fenêtre ne le permet.

Limite : seule l'utilisation via Claude Code et Codex est visible. L'usage dans le navigateur (claude.ai, ChatGPT) n'est pas dans ces fichiers.

## Plusieurs profils Claude

Chaque dossier de configuration Claude Code (`~/.claude`, `~/.claude-<nom>`, choisi via `CLAUDE_CONFIG_DIR`) est un profil. Le widget affiche une carte par profil : % officiel (forfaits), coût estimé aujourd'hui / 7 jours / mois, et un total du mois.

Par défaut, les profils sont détectés automatiquement (tout dossier `~/.claude*` contenant `projects/`). Pour les nommer, ajoutez-les dans `%APPDATA%\AI-Usage-Widget\settings.json` :

```json
{
  "profiles": [
    { "name": "Moi",   "dir": "~/.claude",       "kind": "forfait" },
    { "name": "Ma collègue", "dir": "~/.claude-collegue", "kind": "forfait" },
    { "name": "API",   "dir": "~/.claude-api",   "kind": "api" }
  ]
}
```

`kind` : `forfait` (abonnement, avec quotas 5 h / 7 j) ou `api` (facturé à l'usage, pas de quota). Les coûts sont estimés aux prix publics de l'API, définis dans `src/collectors/pricing.json` (grille unique, aussi lue par le panneau Herdr `claude-usage` ; chemin modifiable via la variable `AI_USAGE_PRICING`) ; pour un forfait, c'est un équivalent API, pas ce que vous payez.

## Activer le % officiel Claude

Claude Code transmet `rate_limits` à la status line (plans Pro, Max et Ultra). Ajoutez ceci à votre script de status line PowerShell, après la lecture du JSON dans `$j` :

```powershell
if ($j.rate_limits) {
    @{ at = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds(); rate_limits = $j.rate_limits } |
        ConvertTo-Json -Depth 5 -Compress |
        Set-Content -LiteralPath "$HOME/.claude/rate-limits.json" -Encoding utf8NoBOM
}
```

## Utilisation

- `Ctrl+Alt+U` : afficher / masquer
- Clic sur l'icône de la barre des tâches : afficher / masquer. Survol : résumé des %.
- La fenêtre se déplace en la faisant glisser par son titre ; la position est mémorisée.

## Développement

```bash
npm install
npm start        # lancer depuis les sources
npm run build    # dist/AI-Usage-Widget-<version>-portable.exe
```

Nécessite Node.js 20+.

```
main.js                         fenêtre, icône, raccourci, blocage réseau
preload.js                      pont minimal vers l'interface
src/collectors/claude-official  % officiel Claude (rate-limits.json)
src/collectors/claude           tokens Claude Code (transcripts jsonl)
src/collectors/codex            % officiel Codex (rollouts jsonl)
src/renderer/                   interface
```

Outil non officiel, sans lien avec Anthropic ni OpenAI.
