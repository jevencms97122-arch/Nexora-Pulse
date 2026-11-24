# pulse-monitor

> **Facultatif.** Le temps de réponse affiché dans l'onglet État est maintenant mesuré par l'application elle-même,
> à l'ouverture de la page, sans ce programme. Ce moniteur sert seulement à garder un historique des tests
> et à passer une application en « Panne majeure » toute seule, même quand personne n'ouvre l'application.

Petit programme qui teste tes services toutes les minutes et enregistre les résultats dans PocketBase.
Nexora Pulse en tire le **vrai pourcentage de disponibilité** et passe seule une application en « Panne majeure »
quand elle ne répond plus, puis la remet en « Opérationnel » quand elle revient.

## Mise en route

1. **Mets à jour le schéma** : importe `pocketbase/pulse_collections.json` dans PocketBase (`/_/`, Settings, Import collections),
   avec « Merge with the existing collections » activé. Cela ajoute les champs de surveillance et la collection `pulse_uptime`.
2. **Crée un compte pour le moniteur** dans la collection `pulse_editors` (par exemple `monitor@nexora.local`),
   avec un mot de passe que tu n'utilises nulle part ailleurs. Ne réutilise pas ton compte principal.
3. **Configure chaque application** dans Nexora Pulse : Studio, onglet États, crayon, bloc « Surveillance automatique ».
   - *Site ou API (HTTP)* : une adresse comme `http://92.49.99.59:8096/api/health`. Réponse en dessous de 500 = en ligne.
   - *Serveur de jeu ou port (TCP)* : une adresse comme `92.49.99.59:25565`. Connexion réussie = en ligne.
4. **Compile et lance le moniteur** (voir plus bas).

## Compiler

```powershell
cd monitor
cargo build --release
```

Le programme est dans `monitor\target\release\pulse-monitor.exe`.

## Lancer

Copie `lancer-monitor.example.cmd` en `lancer-monitor.cmd`, remplis l'e-mail et le mot de passe, puis double-clique dessus.
Ce fichier est ignoré par Git : le mot de passe ne part jamais sur GitHub.

Variables d'environnement :

| Variable | Rôle | Par défaut |
|---|---|---|
| `PULSE_EMAIL` | E-mail du compte `pulse_editors` | obligatoire |
| `PULSE_PASSWORD` | Mot de passe de ce compte | obligatoire |
| `PULSE_URL` | Adresse de PocketBase | `http://92.49.99.59:8097` |
| `PULSE_INTERVAL_SECS` | Secondes entre deux tests (minimum 15) | `60` |

## Où le faire tourner

Il doit tourner **en permanence**, sinon les heures où il est éteint n'ont aucune mesure.
Le mieux est une machine différente de celle qui héberge tes serveurs : si tout est sur le même PC et que ce PC s'éteint,
le moniteur s'éteint avec lui et rien ne signale la panne.

Pour qu'il démarre avec Windows, crée une tâche planifiée « À l'ouverture de session » qui lance `lancer-monitor.cmd`.

## Comment c'est calculé

- Chaque test réussi ou raté est compté dans la journée (jour UTC) : `ok` sur `total`.
- Le pourcentage affiché est la somme des tests réussis sur la somme des tests, sur 90 jours.
- Un état n'est changé automatiquement qu'après **2 échecs de suite**, pour éviter les fausses alertes.
- Une application en maintenance, dégradée ou en panne déclarée à la main n'est **jamais** écrasée.
- Quand PocketBase est injoignable, ou quand le moniteur est arrêté, ces minutes ne sont pas comptées : l'uptime n'est jamais inventé.
