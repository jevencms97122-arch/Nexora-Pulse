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

## Publier une mise à jour

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
