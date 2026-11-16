# AI Usage Widget : améliorations proposées (v2.0.0)

Base de départ : `crimk22/claude_usage_widget`, commit `d5a7c38` (« Grille de tarifs unique dans pricing.json »).
Livré avec ce document : `ai-usage-widget-v2.0.0.zip`, l'arborescence complète du dépôt, prête à être posée sur une branche.

Le principe de la v1 est conservé tel quel : **100 % local, aucun identifiant, aucun appel réseau**. Les profils multiples, la grille `pricing.json` partagée avec le panneau Herdr et le format `rate-limits.json` restent compatibles.

## 1. Résumé

| Axe | Avant (`d5a7c38`) | Après (v2.0.0) |
|---|---|---|
| Lecture des journaux | Synchrone, bloque l'application à chaque relevé | Asynchrone, par blocs, avec pré-filtrage des lignes |
| Fraîcheur du quota | Figé entre deux réponses de Claude Code | Estimation `≈` calibrée sur vos propres relevés |
| Pilotage | Jauges seules | Prévision, budget du jour, 4 types d'alertes, % dans l'icône |
| Analyse | Coût aujourd'hui / 7 j / mois | Tableau de bord : projets, modèles, habitudes, historique, conseils, sessions actives |
| Restitution | Aucune | Rapport HTML autonome, exports CSV |
| Réglages | Fichier JSON à éditer à la main | Écran de réglages, français et anglais, thème clair ou sombre |
| Relevé du quota | Script PowerShell à modifier soi-même | Relais installable en un clic, avec sauvegarde et désinstallation |
| Qualité | Aucun test | 31 tests unitaires, 1 test de bout en bout, lint, CI |

Volume : 40 fichiers touchés, environ 5 300 lignes ajoutées et 350 supprimées.

## 2. Corrections apportées à l'existant

| Constat sur `d5a7c38` | Correction |
|---|---|
| Les réponses d'un modèle absent de la grille sont comptées à 0 $. Le compteur `unpriced` existe mais n'est affiché nulle part. | Avertissement dans le widget, badge « sans tarif » dans le tableau Modèles, conseil dédié. Le décompte est maintenant par période, plus un cumul depuis le lancement. |
| Le README annonce la variable `AI_USAGE_PRICING`, mais `pricing.js` ne la lit pas. | Ordre de recherche réel : `AI_USAGE_PRICING`, puis une copie utilisateur dans `%APPDATA%`, puis la grille fournie. Un fichier invalide est ignoré au lieu de faire planter. |
| « Lister les préfixes longs en premier » repose sur l'ordre du fichier. | Tri automatique par longueur de préfixe. |
| `listJsonl` et `readNew` sont synchrones, et la rétention est passée à un mois : gel au démarrage sur un gros historique. | `fs.promises`, lecture par blocs de 4 Mo avec pause entre les blocs, lignes sans `"usage"` écartées avant `JSON.parse`. |
| L'ensemble `seen` (dé-duplication) grossit sans limite. | Reconstruit à chaque purge à partir des entrées encore en mémoire. |
| Une ligne en cours d'écriture est gardée comme texte : un caractère multi-octets coupé peut être corrompu. | Le reliquat est gardé en octets et décodé seulement une fois la ligne complète. |
| Le détail par modèle est calculé mais jamais affiché. | Onglet Modèles. |
| Les profils se déclarent en éditant `settings.json` ; un nouveau profil exige un redémarrage. | Écran Réglages : renommer, changer le type, ajouter un dossier, revenir à la détection automatique, pris en compte immédiatement. |
| L'extrait PowerShell du README utilise `-Encoding utf8NoBOM`, absent de Windows PowerShell 5.1. | Le relais et l'extrait manuel utilisent `System.Text.UTF8Encoding($false)`, compatible 5.1. |
| Deux « 7 jours » différents côte à côte (coût calendaire, quota glissant). | Libellés distincts : « Semaine (7 j) » pour le quota, « 7 jours » pour le coût. |
| `settings.json` est écrit sans validation. | Chaque valeur venant de l'interface est reconstruite et bornée dans `src/core/settings.js`. |
| Aucune licence, aucun test. | Licence MIT, tests, ESLint, workflow CI. |

## 3. Nouveautés

### Pilotage

- **Estimation entre deux relevés.** L'application compare, sur les relevés passés, les points de quota gagnés et le coût estimé consommé sur la même période. Elle en tire un ratio personnel (médiane, au moins 3 mesures) et l'applique à l'activité locale depuis le dernier relevé. La valeur est précédée de `≈` et la partie estimée de la barre est hachurée.
- **Prévision.** Heure probable d'atteinte de la limite, ou niveau attendu au reset. Le rythme moyen de la fenêtre est combiné au rythme des 45 dernières minutes.
- **Budget du jour.** Part du quota hebdomadaire utilisable aujourd'hui pour tenir jusqu'au reset.
- **Alertes.** Seuil d'avertissement, seuil critique, limite prévue, et « session réinitialisée » après une session presque épuisée. Une seule fois par fenêtre, rien au démarrage.
- **Icône de la barre système.** Elle affiche le % de session le plus élevé, colorée selon le seuil.

### Tableau de bord (nouvelle fenêtre)

| Onglet | Contenu |
|---|---|
| Vue d'ensemble | Jauges et prévision par profil, coût par jour sur 30 jours, sessions actives avec débit et taille du contexte |
| Projets, Modèles | Coût estimé, part, tokens, réponses, dernière activité, export CSV |
| Habitudes | Carte jour × heure sur 28 jours |
| Historique | Relevés officiels sur 24 h à 90 jours, graphique ou tableau, export CSV |
| Conseils | Règles locales, sans appel à une IA |
| Réglages | Profils, relais, alertes, affichage, grille de tarifs, rapport |

Conseils disponibles : modèles sans tarif, relais absent, modèle haut de gamme sur des réponses courtes, contextes de plus de 150 000 tokens, cache peu ou bien exploité, projet dominant, créneau de pointe, forfait souvent saturé, forfait largement dimensionné.

### Relais status line

Le relais copie l'entrée de la status line, sans l'analyser, dans `<profil>/statusline-last.json`. C'est la seule écriture hors du dossier de l'application, et uniquement sur clic.

| Situation | Comportement |
|---|---|
| Aucune status line | Installation en un clic, `settings.json` sauvegardé avant |
| Status line existante, macOS ou Linux | Le relais se place devant et lui repasse l'entrée |
| Status line existante, Windows | Rien n'est modifié ; l'extrait à coller est affiché |
| `settings.json` illisible | Rien n'est modifié |

### Rapport

Page HTML autonome, sans script ni lien externe : total estimé, par profil, coût par jour, projets, modèles, pics de quota, conseils. Deux périodes : mois en cours ou 30 derniers jours.

### Outillage

- `npm run demo` lance l'application sur un faux dossier personnel généré : toute l'interface est visible sans données réelles.
- `src/core/engine.js` regroupe la logique sans dépendre d'Electron, ce qui la rend testable directement.

## 4. Fichiers

| Fichier | État | Rôle |
|---|---|---|
| `main.js`, `preload.js` | réécrits | Deux fenêtres, IPC vérifié, réglages, exports, alertes |
| `src/collectors/jsonl.js`, `claude.js`, `claude-official.js`, `codex.js`, `pricing.js`, `profiles.js` | modifiés | Lecture asynchrone, ventilation par projet, modèle et session, grille surchargeable |
| `src/core/engine.js` | nouveau | Assemble collecte, estimation, prévision, historique, alertes |
| `src/core/calibration.js`, `forecast.js`, `alerts.js`, `history.js`, `insights.js` | nouveaux | Logique pure, testée |
| `src/core/statusline.js`, `settings.js`, `report.js`, `i18n.js`, `tray-icon.js` | nouveaux | Relais, réglages, rapport, traductions, icône |
| `src/renderer/app.js`, `index.html`, `styles.css` | modifiés | Widget : estimation, prévision, thèmes, langue |
| `src/renderer/dashboard.html`, `.css`, `.js` | nouveaux | Tableau de bord |
| `test/`, `scripts/demo.js`, `eslint.config.js`, `.github/workflows/ci.yml`, `LICENSE` | nouveaux | Tests, démo, lint, CI, licence |

Nouvelles dépendances de développement uniquement : `eslint`, `@eslint/js`, `globals`, `playwright-core`. Aucune dépendance d'exécution n'est ajoutée.

## 5. Intégration

```bash
git checkout -b v2 d5a7c38
# décompresser le zip par-dessus le dépôt (il contient l'arborescence complète)
npm install
npm test && npm run lint
npm run demo        # vérifier l'interface sur de fausses données
npm start           # puis sur les vrais journaux
npm run build       # exe portable
```

Les données existantes sont reprises : `settings.json` (position et profils) et `~/.claude/rate-limits.json`.

## 6. Ce qui a été vérifié

| Vérification | Résultat |
|---|---|
| Tests unitaires (collecteurs, tarifs, estimation, prévision, alertes, historique, conseils, relais, réglages, traductions, moteur) | 31 sur 31 |
| Test de bout en bout : application réelle pilotée sur de faux journaux, widget, 7 onglets, installation du relais, changement de langue et de thème | réussi |
| Zéro réseau : un serveur local qui ne doit jamais être atteint, sollicité depuis l'interface et depuis le processus principal | 0 requête reçue |
| Confidentialité : le texte factice des conversations ne ressort ni dans le widget, ni dans le tableau de bord, ni dans le rapport, ni dans les CSV | confirmé |
| Build empaqueté lancé sur de faux journaux, et génération de l'exe portable Windows | réussi |
| Relais `sh` : entrée enregistrée à l'identique et repassée à une status line existante | réussi |

Tout cela a tourné sous Linux, sur des journaux générés.

## 7. Ce qui n'a pas été vérifié

- **Aucun essai sur Windows.** L'exe se construit, mais n'a pas été lancé sur un poste réel.
- **Le relais PowerShell (`ai-usage-relay.ps1`) n'a pas été exécuté.** Seule la version `sh` l'a été. À tester en premier : installer le relais, envoyer un message dans Claude Code, vérifier que `statusline-last.json` apparaît et que la status line s'affiche toujours.
- **Le champ `rate_limits`** est supposé au format déjà utilisé par la v1 (`five_hour` / `seven_day`, `used_percentage`, `resets_at`). Je n'ai pas pu le confirmer dans la documentation de Claude Code.
- **Les prix de `pricing.json` n'ont pas été contrôlés.** La grille est reprise telle quelle.
- **Le format réel des journaux** n'a été validé que sur des fichiers générés d'après les champs que la v1 lisait déjà, plus `cwd` et `sessionId` pour les projets et les sessions. Si `cwd` manque, le projet est déduit du nom du dossier.
- **L'estimation `≈`** est une extrapolation. Elle ignore l'usage fait ailleurs que sur ce PC et n'apparaît qu'après trois relevés exploitables.

## 8. Points à trancher

1. **Version.** Proposé : 2.0.0, car `main.js` et le format des données poussées à l'interface changent.
2. **Rétention.** 35 jours de journaux en mémoire (au lieu du mois en cours) et 90 jours de relevés dans `state.json`.
3. **Langue par défaut.** Celle du système ; le français reste la langue du README.
4. **Relais sous Windows avec une status line existante.** Choix prudent : ne rien modifier et afficher l'extrait. Un chaînage automatique est possible, mais demande des essais sur poste.
