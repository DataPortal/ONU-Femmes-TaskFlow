# TaskFlow Management Portal — ONU Femmes RDC

## 1. Présentation générale

**TaskFlow Management Portal — ONU Femmes RDC** est une application web légère de gestion, suivi et coordination des tâches, conçue pour faciliter le pilotage opérationnel des activités par pilier, superviseur, staff et activité principale.

L’application permet de :

- créer et suivre des tâches ;
- rattacher chaque tâche à un pilier ;
- rattacher chaque tâche à une activité principale ;
- assigner une tâche à un staff ;
- suivre l’état d’avancement des tâches ;
- permettre aux staff de commenter leur progression ;
- permettre aux superviseurs d’évaluer et commenter les tâches ;
- disposer d’un tableau de bord global ;
- consulter les tâches individuelles ;
- consulter les tâches d’équipe ;
- gérer les piliers, les membres et les activités principales ;
- exporter les données en XLSX ;
- imprimer les vues principales.

L’application est déployable sur **GitHub Pages** et utilise **Supabase** pour l’authentification, la base de données et la gestion des accès.

---

## 2. Architecture fonctionnelle

L’application repose sur cinq espaces principaux :

### 2.1 Page d’accueil

**Fichier :**

```text
index.html
