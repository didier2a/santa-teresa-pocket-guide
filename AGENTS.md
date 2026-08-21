# Instructions Codex — Santa Teresa Pocket Guide

## Objectif
Maintenir une PWA mobile-first très légère et premium pour un séjour de 2 jours à Santa Teresa di Gallura.

## Contraintes
1. Ne pas introduire de framework ou de backend sans nécessité démontrée.
2. `data/trip.json` reste la source principale du contenu du voyage.
3. Préserver l'installation PWA et le mode hors ligne.
4. Préserver les liens Google Agenda existants et les Deep Links Waze.
5. Ne pas inventer d'horaires de ferry ou d'hôtel : afficher `À compléter` tant que l'information n'est pas fournie.
6. Pour Capo Testa, conserver la note de prudence : les horaires sont publiés par l'office de tourisme mais doivent être reconfirmés auprès de la compagnie avant le départ.
7. Accessibilité : zones tactiles >= 44 px lorsque possible, contrastes lisibles, navigation clavier et `prefers-reduced-motion`.
8. Mobile d'abord, priorité Android / Chrome mais sans casser Safari iOS.
9. N'ajouter une dépendance externe que si elle apporte une valeur claire.

## Design
- palette méditerranéenne : bleu profond, turquoise, sable, blanc cassé ;
- grandes typographies éditoriales ;
- cartes très lisibles et espacées ;
- éviter les interfaces surchargées.
