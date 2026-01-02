# Cahier des Charges : Custom Command Claude `/track-html-elements`

## 1. Vue d'Ensemble

### Type
**Custom Command Claude Code** - Fichier `.claude/commands/track-html-elements.md`

### Objectif
Analyser automatiquement les fichiers HTML d'un projet, détecter les éléments trackables via un système de règles descriptives pondérées, et injecter les attributs `data-track`.

### Contexte d'Exécution
Claude Code a accès à **tout le projet** :
- Fichiers HTML (DEV, pas PROD)
- Fichiers CSS (pour déduire les styles depuis les classes)
- Fichiers YAML de configuration

---

## 2. Architecture

### Fichiers Impliqués

```
projet-client/
├── tracking/
│   ├── tracking-events.yaml    # QUOI tracker (events avec ruleset)
│   └── tracking-rules.yaml     # COMMENT détecter (règles descriptives)
├── src/                        # ou public/, dist/...
│   ├── *.html                  # Fichiers à analyser
│   └── styles/                 # CSS pour déduire les styles
```

### Relation entre Fichiers

| Fichier | Rôle | Contient |
|---------|------|----------|
| `tracking-events.yaml` | QUOI tracker | Liste des events avec leur `ruleset` associé |
| `tracking-rules.yaml` | COMMENT détecter | Règles descriptives avec poids |

---

## 3. Format des Règles (tracking-rules.yaml)

### Philosophie
Les règles sont **descriptives et humaines**, pas techniques. Claude les interprète en analysant le HTML et le CSS du projet.

### Structure d'un Ruleset

```yaml
rulesets:

  primary_cta:
    description: "Bouton d'action principal du site (CTA de conversion)"
    target_tags: ["button", "a", "div[role=button]"]

    indices:
      - texte: "Fond de couleur primaire (pas outline, pas ghost, pas transparent)"
        weight: 20

      - texte: "Texte court avec verbe d'action fort (Commencer, Essayer, Démarrer, S'inscrire...)"
        weight: 15

      - texte: "Isolé ou visuellement mis en avant dans sa section"
        weight: 15

      - texte: "Présent dans une zone critique (hero, header, above-the-fold)"
        weight: 15

      - texte: "Contenu identique ou similaire répété sur plusieurs pages du site"
        weight: 10

      - texte: "Taille plus grande que les autres boutons de la section"
        weight: 10

      - texte: "Pas de style outline, ghost, ou link"
        weight: 10

      - texte: "A un ID ou une classe distinctive (cta, action, primary...)"
        weight: 5

    seuils:
      tres_confiant: 85   # ≥85% → injection automatique
      confiant: 70        # ≥70% → injection automatique
      incertain: 50       # ≥50% → mentionné dans le rapport, pas injecté
      faible: 0           # <50% → ignoré
```

### Champs Obligatoires

| Champ | Type | Description |
|-------|------|-------------|
| `description` | string | Description humaine du ruleset |
| `target_tags` | array | Tags HTML ciblés |
| `indices` | array | Liste de règles avec `texte` et `weight` |
| `seuils` | object | Seuils de confiance (tres_confiant, confiant, incertain, faible) |

---

## 4. Format des Events (tracking-events.yaml)

```yaml
project:
  name: "mon-projet"
  gtm_container_id: "GTM-XXXXXX"
  ga4_measurement_id: "G-XXXXXXXXXX"

events:
  - event_name: "cta_primary"
    description: "Clic sur le CTA principal"
    category: "engagement"
    trigger: "click"
    selector: "[data-track='cta-primary']"
    ruleset: "primary_cta"              # Lien vers tracking-rules.yaml

  - event_name: "cta_secondary"
    description: "Clic sur un CTA secondaire"
    category: "engagement"
    trigger: "click"
    selector: "[data-track='cta-secondary']"
    ruleset: "secondary_cta"
```

**Note** : Seuls les events avec `ruleset` sont traités par `/track-html-elements`.

---

## 5. Syntaxe de la Commande

```bash
/track-html-elements --dir ./src [--threshold confiant] [--dry-run] [--file <path>]
```

### Options

| Option | Description | Défaut |
|--------|-------------|--------|
| `--dir <path>` | Dossier HTML à analyser | **obligatoire** |
| `--threshold` | `tres_confiant`, `confiant`, `incertain` | `confiant` |
| `--dry-run` | Simulation sans modification | `false` |
| `--file <path>` | Traiter un seul fichier | - |

---

## 6. Workflow d'Exécution

### Étape 1 : Validation

```
1. Lire tracking-events.yaml
2. Lire tracking-rules.yaml
3. Valider cohérence (rulesets référencés existent)
4. Scanner fichiers HTML dans --dir
```

**Erreurs bloquantes** :
- YAML manquant → STOP + proposer création template
- Ruleset référencé inexistant → STOP + lister rulesets disponibles
- Dossier HTML vide → STOP + message

### Étape 2 : Analyse CSS

```
1. Identifier les fichiers CSS du projet (*.css, y compris dans node_modules si Tailwind)
2. Mapper les classes aux styles (couleurs, borders, backgrounds...)
3. Créer un index des styles pour référence
```

**Objectif** : Pouvoir déduire qu'un élément avec `class="bg-blue-600"` a un fond bleu.

**Si CSS introuvable** : WARNING + continuer sans styles déduits.

### Étape 3 : Analyse Cross-Fichiers

```
1. Scanner TOUS les fichiers HTML du dossier
2. Identifier les éléments récurrents (même texte, mêmes classes)
3. Noter la fréquence d'apparition par élément
```

**Objectif** : Détecter qu'un bouton "Commencer maintenant" apparaît sur 5+ pages.

### Étape 4 : Extraction des Éléments

Pour chaque fichier HTML :

```
1. Parser le HTML
2. Extraire éléments selon target_tags de chaque ruleset
3. Collecter métadonnées enrichies (incluant styles déduits)
```

### Étape 5 : Scoring

Pour chaque élément × chaque ruleset :

```
1. Évaluer chaque indice (Claude interprète le texte descriptif)
2. Calculer score = Σ(poids des indices matchés) / Σ(poids total) × 100
3. Déterminer niveau de confiance selon seuils
```

### Étape 6 : Résolution des Conflits

```
Si un élément matche plusieurs events ≥ seuil :
→ Choisir celui avec le meilleur score
→ En cas d'égalité : ordre alphabétique + warning
```

### Étape 7 : Injection

```
1. Créer backup timestampé (sauf --dry-run)
2. Injecter data-track="valeur"
3. Préserver indentation exacte
```

### Étape 8 : Rapport

Afficher le rapport concis (voir section 9).

---

## 7. Comment Claude Évalue les Indices

Claude interprète chaque indice en langage naturel. Exemples :

### Indice : "Fond de couleur primaire"

```
1. Lire les classes CSS de l'élément : class="btn bg-blue-600 text-white"
2. Chercher dans le CSS du projet ce que fait .bg-blue-600
3. Si c'est une couleur vive (pas gray, pas transparent) → MATCH
4. Bonus si c'est la même couleur que d'autres CTAs du site
```

### Indice : "Isolé ou visuellement mis en avant"

```
1. Compter les autres boutons dans la même <section>
2. Si seul bouton → MATCH fort
3. Si accompagné mais plus grand/coloré → MATCH moyen
4. Si perdu parmi plusieurs boutons similaires → PAS DE MATCH
```

### Indice : "Contenu répété sur plusieurs pages"

```
1. Utiliser l'analyse cross-fichiers (étape 3)
2. Si un bouton "Commencer maintenant" apparaît sur 5+ pages → MATCH
3. Si unique à cette page → PAS DE MATCH
```

---

## 8. Métadonnées Extraites par Élément

```javascript
{
  // Identification
  file: "index.html",
  line: 23,
  tag: "button",
  html: "<button class='btn bg-blue-600'>Commencer</button>",

  // Contenu
  text: "Commencer",
  textLower: "commencer",

  // Attributs
  id: "btn-cta",
  classes: ["btn", "bg-blue-600", "text-white", "px-6", "py-3"],

  // Styles déduits (depuis CSS)
  styles: {
    backgroundColor: "#2563eb",  // déduit de bg-blue-600
    color: "#ffffff",
    border: "none",
    isOutline: false,
    isGhost: false
  },

  // Contexte
  section: "hero",
  parentNav: false,
  siblingButtons: 0,

  // Récurrence (cross-fichiers)
  occurrences: 5,  // Trouvé sur 5 pages
  occurrenceFiles: ["index.html", "about.html", "pricing.html", ...]
}
```

---

## 9. Format du Rapport (Concis)

```
📊 /track-html-elements
─────────────────────────

✓ 2 events avec ruleset
✓ 2 rulesets chargés
✓ 8 fichiers HTML analysés
✓ 3 fichiers CSS indexés

Seuil : confiant (≥70%)

─────────────────────────

✅ 12 attributs injectés

  index.html
    L.23  cta_primary     92%  <button>Commencer maintenant</button>
    L.67  cta_secondary   74%  <a>Découvrir les fonctionnalités</a>

  about.html
    L.45  cta_primary     88%  <button>Commencer maintenant</button>

  [...]

─────────────────────────

⚠️ 5 éléments incertains (50-69%)

  index.html:89   58%  <button>En savoir plus</button>
  services.html:34  52%  <a>Voir les détails</a>
  [...]

─────────────────────────

Backups : ./tracking/backups/20260101-120000/
```

---

## 10. Règles Strictes

### Un Élément = Un Seul Event
Jamais plusieurs `data-track` sur le même élément.

### Préservation HTML
- Garder l'indentation exacte
- Placer l'attribut après `class`
- Ne pas reformater

### Backup Obligatoire
Créer backup avant modification (sauf `--dry-run`).

### Éléments Déjà Trackés
Si `data-track` existe déjà → ignorer et mentionner.

---

## 11. Gestion des Erreurs

| Erreur | Action |
|--------|--------|
| YAML manquant | STOP + proposer création template |
| Ruleset référencé inexistant | STOP + lister rulesets disponibles |
| Dossier HTML vide | STOP + message |
| CSS introuvable | WARNING + continuer sans styles déduits |
| Conflit de scores égaux | Prendre le premier par ordre alphabétique + warning |

---

## 12. Exemple Complet d'Évaluation

### Élément HTML

```html
<!-- index.html, ligne 23 -->
<section id="hero">
  <button class="btn bg-blue-600 text-white px-8 py-4 rounded-lg text-lg font-bold">
    Commencer maintenant
  </button>
</section>
```

### Ruleset : primary_cta

| Indice | Évaluation | Match | Poids |
|--------|------------|-------|-------|
| Fond de couleur primaire | `bg-blue-600` = bleu vif | ✓ | 20 |
| Verbe d'action fort | "Commencer" | ✓ | 15 |
| Isolé dans sa section | Seul bouton dans #hero | ✓ | 15 |
| Zone critique | Section "hero" | ✓ | 15 |
| Répété sur le site | Trouvé sur 6 pages | ✓ | 10 |
| Plus grand | `text-lg px-8 py-4` | ✓ | 10 |
| Pas de style outline | Pas de border, fond plein | ✓ | 10 |
| ID/classe distinctive | class contient "btn" | ✓ | 5 |

**Score** : 100/100 = **100%** → `tres_confiant`

**Action** : Injecter `data-track="cta-primary"`

---

## 13. Mode Dry-Run

Avec `--dry-run` :
- ✅ Analyse complète
- ✅ Rapport généré
- ❌ Pas de backup
- ❌ Pas de modification

Message final :
```
🔍 MODE SIMULATION (--dry-run)

Aucun fichier n'a été modifié.

Pour appliquer : /track-html-elements --dir ./src
```

---

## 14. Ce qui est EXCLU

| Exclu | Raison |
|-------|--------|
| `combined_rules` | Complexité inutile, les indices suffisent |
| Rapport détaillé par règle | Trop verbeux |
| Mode interactif | Soit 100% auto, soit `/html-layer` manuel |
| Export Markdown | Le rapport console suffit |
| Priorités d'events | Le meilleur score gagne |

---

## 15. Prérequis de Validation

Avant de commencer, Claude DOIT vérifier :

### tracking-events.yaml
- ✓ Le fichier existe
- ✓ Section `events:` présente avec au moins 1 événement
- ✓ Chaque événement a : `event_name`, `description`, `ruleset`
- ✓ Les `event_name` sont en snake_case et uniques

### tracking-rules.yaml
- ✓ Le fichier existe
- ✓ Section `rulesets:` présente
- ✓ Tous les rulesets référencés dans `tracking-events.yaml` existent
- ✓ Chaque ruleset a : `target_tags`, `indices`, `seuils`

### Dossier HTML
- ✓ Le dossier `--dir` existe
- ✓ Contient au moins 1 fichier `.html`

---

## 16. Templates de Création

Si YAML manquant, proposer ces templates :

### tracking-events.yaml

```yaml
project:
  name: "mon-projet"

events:
  - event_name: "cta_primary"
    description: "Clic sur le CTA principal"
    category: "engagement"
    trigger: "click"
    selector: "[data-track='cta-primary']"
    ruleset: "primary_cta"

  - event_name: "cta_secondary"
    description: "Clic sur un CTA secondaire"
    category: "engagement"
    trigger: "click"
    selector: "[data-track='cta-secondary']"
    ruleset: "secondary_cta"
```

### tracking-rules.yaml

```yaml
rulesets:

  primary_cta:
    description: "Bouton d'action principal du site"
    target_tags: ["button", "a", "div[role=button]"]

    indices:
      - texte: "Fond de couleur primaire (pas outline, pas ghost)"
        weight: 20
      - texte: "Texte court avec verbe d'action fort (Commencer, Essayer...)"
        weight: 15
      - texte: "Isolé ou mis en avant dans sa section"
        weight: 15
      - texte: "Présent dans une zone critique (hero, header)"
        weight: 15
      - texte: "Répété sur plusieurs pages du site"
        weight: 10
      - texte: "Taille plus grande que les autres boutons"
        weight: 10
      - texte: "Pas de style outline ou ghost"
        weight: 10
      - texte: "ID ou classe distinctive (cta, primary...)"
        weight: 5

    seuils:
      tres_confiant: 85
      confiant: 70
      incertain: 50
      faible: 0

  secondary_cta:
    description: "Bouton d'action secondaire"
    target_tags: ["button", "a"]

    indices:
      - texte: "Style outline, ghost, ou bordure sans fond plein"
        weight: 20
      - texte: "Texte avec verbe d'exploration (Découvrir, Voir, En savoir plus...)"
        weight: 15
      - texte: "Accompagne un bouton primaire dans la même section"
        weight: 15
      - texte: "Présent dans les sections de contenu (features, services)"
        weight: 10
      - texte: "Taille égale ou inférieure aux autres boutons"
        weight: 10
      - texte: "Couleur moins contrastée que le CTA primaire"
        weight: 10

    seuils:
      tres_confiant: 85
      confiant: 70
      incertain: 50
      faible: 0

  nav_link:
    description: "Lien de navigation principale"
    target_tags: ["a", "button"]

    indices:
      - texte: "Situé dans un <nav> ou <header>"
        weight: 25
      - texte: "Texte court (1-3 mots) sans verbe d'action"
        weight: 15
      - texte: "Fait partie d'une liste de liens similaires"
        weight: 15
      - texte: "Pas de style bouton (pas de background prononcé)"
        weight: 10
      - texte: "href interne (même domaine ou chemin relatif)"
        weight: 10

    seuils:
      tres_confiant: 80
      confiant: 65
      incertain: 45
      faible: 0
```

---

## 17. Différences avec l'Ancien CDC

| Avant | Après |
|-------|-------|
| Règles techniques (`has_class_pattern`) | Règles descriptives (texte humain) |
| Pas d'accès CSS | Claude analyse les CSS du projet |
| Analyse fichier par fichier | Analyse cross-fichiers (récurrence) |
| Rapport 100+ lignes | Rapport concis (~30 lignes) |
| `data-tracking-event` | `data-track` |
| `priority` pour conflits | Meilleur score gagne |
| `combined_rules` | Supprimé |
| Seuils en anglais | Seuils en français |

---

## 18. Structure du Prompt Claude Code

### Principes de Rédaction

Une commande Claude Code efficace doit être :
- **Explicite** : Claude ne devine pas, il suit des instructions
- **Séquentielle** : Étapes ordonnées avec conditions claires
- **Contraignante** : Règles strictes = comportement prévisible
- **Complète** : Couvrir tous les cas (succès, erreurs, edge cases)

### Template de Structure

```
## Prérequis
[Ce qui DOIT exister avant d'exécuter]

## Objectif
[But précis de la commande]

## Workflow
[Étapes séquentielles à suivre]

## Règles Strictes
[Contraintes NON négociables]

## Recommandations
[Meilleures pratiques]

## Gestion des Erreurs
[Que faire en cas de problème]

## Critères de Complétion
[Quand considérer la tâche terminée]
```

---

## 19. Commande Claude Code Complète

Fichier à créer : `~/.claude/commands/track-html-elements.md`

```markdown
# /track-html-elements

Injecte automatiquement les attributs `data-track` dans les fichiers HTML en analysant les éléments selon des règles descriptives pondérées.

## Prérequis

Avant de commencer, vérifie que ces fichiers existent :

1. **tracking/tracking-events.yaml**
   - Contient la section `events:` avec au moins 1 event
   - Chaque event a : `event_name`, `category`, `trigger`, `selector`, `ruleset`

2. **tracking/tracking-rules.yaml**
   - Contient la section `rulesets:`
   - Chaque ruleset référencé dans les events existe
   - Chaque ruleset a : `description`, `target_tags`, `indices`, `seuils`

3. **Dossier HTML** (argument `--dir`)
   - Le dossier existe
   - Contient au moins 1 fichier `.html`

**Si un prérequis manque** → STOP + afficher message d'erreur + proposer de créer un template.

## Objectif

Analyser les fichiers HTML du projet et injecter `data-track="valeur"` sur les éléments qui correspondent aux rulesets définis, selon un score de confiance calculé.

**Entrée** : Fichiers HTML + YAML de configuration
**Sortie** : Fichiers HTML modifiés + rapport concis

## Workflow

Exécute ces étapes dans l'ordre :

### Étape 1 : Validation
1. Lire `tracking/tracking-events.yaml`
2. Lire `tracking/tracking-rules.yaml`
3. Vérifier que tous les `ruleset` référencés existent
4. Lister les fichiers `.html` dans `--dir`
5. Si erreur → STOP avec message explicite

### Étape 2 : Analyse CSS
1. Chercher les fichiers CSS du projet (`*.css`, `tailwind.config.js`)
2. Mapper les classes Tailwind/CSS aux styles (couleurs, backgrounds, borders)
3. Créer un index mental des styles pour référence
4. Si aucun CSS trouvé → WARNING + continuer (styles non déduits)

### Étape 3 : Analyse Cross-Fichiers
1. Scanner TOUS les fichiers HTML
2. Identifier les éléments avec texte/classes identiques sur plusieurs pages
3. Noter la fréquence d'apparition (ex: "Commencer" → 5 pages)

### Étape 4 : Extraction des Éléments
Pour chaque fichier HTML :
1. Parser le HTML
2. Pour chaque ruleset, extraire les éléments correspondant aux `target_tags`
3. Collecter les métadonnées : tag, id, classes, texte, section parente, styles déduits

### Étape 5 : Scoring
Pour chaque élément × chaque ruleset :
1. Lire chaque `indice` du ruleset
2. Interpréter le `texte:` en langage naturel
3. Évaluer si l'élément correspond (oui/non)
4. Si oui → ajouter le `weight` au score
5. Calculer : `score = (poids_matchés / poids_total) × 100`
6. Comparer aux `seuils` pour déterminer le niveau de confiance

### Étape 6 : Résolution des Conflits
Si un élément matche plusieurs events au-dessus du seuil :
1. Prendre l'event avec le meilleur score
2. En cas d'égalité → ordre alphabétique + warning dans le rapport

### Étape 7 : Injection
Si `--dry-run` n'est PAS actif :
1. Créer un dossier de backup : `tracking/backups/YYYYMMDD-HHMMSS/`
2. Copier les fichiers HTML originaux dans ce dossier
3. Pour chaque élément qualifié :
   - Injecter `data-track="valeur"` après l'attribut `class`
   - Préserver l'indentation exacte
   - NE PAS reformater le HTML

### Étape 8 : Rapport
Afficher un rapport concis :
```
📊 /track-html-elements
─────────────────────────
✓ X events avec ruleset
✓ X rulesets chargés
✓ X fichiers HTML analysés
Seuil : [threshold] (≥XX%)
─────────────────────────
✅ X attributs injectés
  [fichier]
    L.XX  [event_name]  XX%  <tag>texte</tag>
─────────────────────────
⚠️ X éléments incertains (50-69%)
  [fichier]:XX  XX%  <tag>texte</tag>
─────────────────────────
Backups : ./tracking/backups/XXXXXX/
```

## Règles Strictes

Ces règles sont NON négociables :

1. **Un élément = Un seul data-track**
   - JAMAIS injecter plusieurs `data-track` sur le même élément
   - Si conflit → meilleur score gagne

2. **Préservation HTML**
   - Garder l'indentation exacte (espaces, tabs)
   - Placer `data-track` après `class` (ou après `id` si pas de class)
   - NE PAS reformater, réindenter, ou modifier autre chose

3. **Backup obligatoire**
   - Créer backup AVANT toute modification
   - Exception : mode `--dry-run`

4. **Éléments déjà trackés**
   - Si `data-track` existe déjà → ignorer et mentionner dans le rapport

5. **Cohérence YAML**
   - JAMAIS injecter un event qui n'existe pas dans `tracking-events.yaml`
   - JAMAIS utiliser un ruleset qui n'existe pas dans `tracking-rules.yaml`

## Recommandations

- **Interprétation des indices** : Lis le `texte:` comme une description humaine, pas comme du code. Utilise ton jugement pour évaluer si l'élément correspond.

- **Déduction des styles** : Pour évaluer "fond de couleur primaire", regarde les classes CSS de l'élément et déduis les styles appliqués (Tailwind: `bg-blue-600` = bleu).

- **Contexte** : Prends en compte la position de l'élément (hero, nav, footer), ses voisins (autres boutons), et sa récurrence sur le site.

- **Score partiel** : Un indice peut matcher partiellement. Par exemple, "verbe d'action fort" matche mieux pour "Commencer" que pour "Voir".

## Gestion des Erreurs

| Erreur | Action |
|--------|--------|
| `tracking-events.yaml` manquant | STOP + proposer création template |
| `tracking-rules.yaml` manquant | STOP + proposer création template |
| Ruleset référencé inexistant | STOP + lister les rulesets disponibles |
| Dossier `--dir` inexistant | STOP + message |
| Aucun fichier HTML | STOP + message |
| CSS introuvable | WARNING + continuer sans déduction de styles |
| HTML mal formé | WARNING + ignorer les éléments problématiques |
| Scores égaux (conflit) | Ordre alphabétique + warning dans rapport |

## Critères de Complétion

La commande est terminée quand :

1. ✅ Tous les fichiers HTML ont été analysés
2. ✅ Tous les éléments qualifiés ont reçu `data-track`
3. ✅ Le rapport a été affiché
4. ✅ Les backups ont été créés (sauf `--dry-run`)

**Mode `--dry-run`** : La commande est terminée après affichage du rapport (pas de modification).

## Arguments

| Argument | Obligatoire | Description | Défaut |
|----------|-------------|-------------|--------|
| `--dir <path>` | Oui | Dossier contenant les HTML | - |
| `--threshold` | Non | `tres_confiant`, `confiant`, `incertain` | `confiant` |
| `--dry-run` | Non | Simulation sans modification | `false` |
| `--file <path>` | Non | Traiter un seul fichier | - |

## Exemple d'Évaluation d'Indice

**Indice** : `"Fond de couleur primaire (pas outline, pas ghost, pas transparent)"`
**Weight** : 20

**Élément** : `<button class="btn bg-blue-600 text-white px-6 py-3">Commencer</button>`

**Évaluation** :
1. Classes CSS : `bg-blue-600` → fond bleu (couleur vive)
2. Pas de classe `outline`, `ghost`, `transparent` → OK
3. Résultat : MATCH → +20 points
```
