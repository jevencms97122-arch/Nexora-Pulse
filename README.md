# Nexora Pulse

L'application qui réunit les annonces, les mises à jour et l'état de tout l'écosystème Nexora.
Construite avec **Tauri 2** (Rust), **React**, **Tailwind**, **Motion** et **anime.js**, connectée à **PocketBase**.

## Lancer

```powershell
npm install
npm run tauri dev      # l'application complète
npm run dev            # l'interface seule, avec des données de démo
npm run tauri build    # installeur Windows
```

## Installer le back-end

1. Ouvre `http://92.49.99.59:8097/_/` et connecte-toi.
2. Va dans **Settings > Import collections** et colle le contenu de `pocketbase/pulse_collections.json`.
3. Coche **Merge with the existing collections** pour ne rien supprimer, puis valide.
4. Dans la collection `pulse_editors`, crée ton compte éditeur.
5. Dans Nexora Pulse, ouvre **Réglages > Administration**, connecte-toi, puis va dans **Studio > États > Importer depuis le Store**.

Utilise un compte `pulse_editors` dans l'application, jamais un compte superuser.
Tant que le serveur est en HTTP, le mot de passe circule sans chiffrement : choisis-en un que tu n'utilises nulle part ailleurs.
Pour passer en HTTPS, change les adresses dans `src-tauri/src/config.rs` et dans la CSP de `src-tauri/tauri.conf.json`.

## Publier depuis Claude (serveur MCP)

Le dossier `mcp/` contient un serveur MCP qui permet à Claude, dans n'importe quelle conversation Claude Code,
de publier directement dans Nexora Pulse. Il est enregistré pour toutes tes conversations sous le nom `nexora-pulse`.

1. Installe ses dépendances une fois : `cd mcp` puis `npm install`.
2. Copie `mcp/.env.example` en `mcp/.env` et mets l'e-mail et le mot de passe d'un compte `pulse_editors`.
   Ce fichier est ignoré par Git.
3. Ouvre une nouvelle conversation Claude Code et demande par exemple :
   « Publie une mise à jour 1.2.0 de Nexora Music avec ces changements : ... ».

| Outil | Rôle |
|---|---|
| `pulse_create_announcement` | Publier une annonce, une actualité, un événement ou une maintenance, avec une image de couverture (`cover_path`) |
| `pulse_set_cover` | Ajouter ou remplacer l'image de couverture d'une annonce |
| `pulse_create_update` | Publier une mise à jour d'une application (version et notes) |
| `pulse_set_app_status` | Changer l'état d'une application |
| `pulse_open_incident` / `pulse_update_incident` | Déclarer et suivre un incident |
| `pulse_list_apps` / `pulse_list_recent` | Voir les applications et les derniers contenus |
| `pulse_delete` | Supprimer une annonce, une mise à jour ou un incident |

Chaque outil accepte `draft: true` pour enregistrer un brouillon à relire dans le Studio avant publication.

## Publier une nouvelle version de Nexora Pulse

```powershell
npm run release -- 0.1.1
```

La commande change la version, crée le commit et le tag, puis pousse sur GitHub.
GitHub Actions compile, signe et publie la release. Les applications installées la téléchargent toutes seules :
au lancement puis toutes les 4 heures. Elle s'installe dès que la fenêtre est fermée, ou tout de suite avec **Redémarrer**.

La clé de signature est dans `%USERPROFILE%\.tauri\nexora-pulse.key`. **Garde-en une copie en lieu sûr** : sans elle,
les applications déjà installées ne pourront plus recevoir de mises à jour. Elle ne doit jamais être ajoutée au dépôt.

## Structure

```
src/                 Interface React (pages, composants, état)
src-tauri/src/
  pb.rs              Client PocketBase
  sync.rs            Synchronisation, temps réel, notifications
  auth.rs            Session éditeur (Gestionnaire d'identifiants Windows)
  admin.rs           Actions du Studio
  updater.rs         Mises à jour automatiques
pocketbase/          Schéma des collections
```
