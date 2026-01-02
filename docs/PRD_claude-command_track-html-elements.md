# PRD : Custom Command Claude `/track-html-elements`

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

---

## 3. Format des Règles (tracking-rules.yaml)

### Philosophie
Les règles sont **descriptives et humaines**, pas techniques. Claude les interprète en analysant le HTML et le CSS du projet.

### Structure

```yaml
# tracking-rules.yaml
# Règles de détection pour /track-html-elements

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


  secondary_cta:
    description: "Bouton d'action secondaire (découvrir, en savoir plus)"
    target_tags: ["button", "a"]

    indices:
      - texte: "Style outline, ghost, ou bordure sans fond plein"
        weight: 20

      - texte: "Texte avec verbe d'exploration (Découvrir, Voir, En savoir plus, Explorer...)"
        weight: 15

      - texte: "Accompagne un bouton primaire dans la même section"
        weight: 15

      - texte: "Présent dans les sections de contenu (features, services, about)"
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

      - texte: "Pas de style bouton (pas de background, pas de border-radius prononcé)"
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

## 4. Fichier tracking-events.yaml

Réutilise le fichier existant avec ajout du champ `ruleset` :

```yaml
# tracking-events.yaml

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

  - event_name: "nav_click"
    description: "Clic sur un lien de navigation"
    category: "navigation"
    trigger: "click"
    selector: "[data-track='nav']"
    ruleset: "nav_link"
```

**Note** : Seuls les events avec `ruleset` sont traités par `/track-html-elements`.

---

## 5. Workflow de la Commande

### Syntaxe

```bash
/track-html-elements --dir ./src [--threshold confiant] [--dry-run]
```

### Étapes

```
1. VALIDATION
   ├── Lire tracking-events.yaml
   ├── Lire tracking-rules.yaml
   ├── Valider cohérence (rulesets référencés existent)
   └── Scanner fichiers HTML dans --dir

2. ANALYSE CSS (nouveau)
   ├── Identifier les fichiers CSS du projet
   ├── Mapper les classes aux styles (couleurs, borders, backgrounds...)
   └── Créer un index des styles pour référence

3. ANALYSE CROSS-FICHIERS (nouveau)
   ├── Scanner TOUS les fichiers HTML
   ├── Identifier les éléments récurrents (même texte, mêmes classes)
   └── Noter la fréquence d'apparition

4. EXTRACTION (par fichier)
   ├── Parser HTML
   ├── Extraire éléments selon target_tags
   └── Collecter métadonnées enrichies (incluant styles déduits)

5. SCORING
   ├── Pour chaque élément × chaque ruleset
   ├── Évaluer chaque indice (Claude interprète le texte)
   ├── Calculer score = Σ(poids des indices matchés) / Σ(poids total)
   └── Déterminer niveau de confiance selon seuils

6. RÉSOLUTION CONFLITS
   ├── Si élément match plusieurs events ≥ seuil
   └── Choisir celui avec le meilleur score

7. INJECTION (sauf --dry-run)
   ├── Créer backup timestampé
   ├── Injecter data-track="valeur"
   └── Préserver indentation exacte

8. RAPPORT CONCIS
   └── Résumé des actions prises
```

---

## 6. Comment Claude Évalue les Indices

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

## 7. Métadonnées Extraites par Élément

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

## 8. Format du Rapport (Concis)

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

## 9. Options CLI

| Option | Description | Défaut |
|--------|-------------|--------|
| `--dir <path>` | Dossier HTML à analyser | **obligatoire** |
| `--threshold` | `tres_confiant`, `confiant`, `incertain` | `confiant` |
| `--dry-run` | Simulation sans modification | `false` |
| `--file <path>` | Traiter un seul fichier | - |

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

## 12. Ce qui est EXCLU

| Exclu | Raison |
|-------|--------|
| `combined_rules` | Complexité inutile |
| Rapport détaillé par règle | Trop verbeux |
| Mode interactif | Soit 100% auto, soit `html-layer` manuel |
| Export Markdown | Le rapport console suffit |

---

## 13. Exemple Complet d'Évaluation

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

## 14. Structure du Prompt Claude Code

### Template Recommandé

Une commande Claude Code efficace suit cette structure :

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

### Principes de Rédaction

- **Explicite** : Claude ne devine pas, il suit des instructions
- **Séquentiel** : Étapes ordonnées avec conditions claires
- **Contraignant** : Règles strictes = comportement prévisible
- **Complet** : Couvrir tous les cas (succès, erreurs, edge cases)

---

## 15. Différences avec l'Ancien CDC

| Avant | Après |
|-------|-------|
| Règles techniques (`has_class_pattern`) | Règles descriptives ("Fond de couleur primaire") |
| Pas d'accès CSS | Claude analyse les CSS du projet |
| Analyse fichier par fichier | Analyse cross-fichiers (récurrence) |
| Rapport 100+ lignes | Rapport concis |
| `data-tracking-event` | `data-track` |
| `priority` pour conflits | Meilleur score gagne |
