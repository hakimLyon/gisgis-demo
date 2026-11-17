# Gisgis, démo

Démo d'une plateforme qui réunit sur une seule carte l'imagerie d'un site, les plans d'un projet et les observations de terrain. Elle sert à montrer l'idée à des prospects : cabinets de topographie, mines, promoteurs, bailleurs.

« Gisgis » est un nom provisoire : en wolof, *gis-gis* veut dire « vision, point de vue », avec un clin d'œil au SIG (*GIS* en anglais). Il se change dans `index.html` et dans `js/main.js`.

## Ce que montre la démo

Deux projets autour de Dakar :

- **Médina Gounass (Guédiawaye), gestion des eaux pluviales.** Une orthophoto drone réelle de 2017 (2,5 cm par pixel), un plan fictif tracé le long de rues réelles (bassin de stockage, deux collecteurs, une surverse vers le bassin existant n° 1) et une simulation d'inondation. On monte le niveau d'eau sur la mire et la carte compte les bâtiments situés sous ce niveau.
- **Stade de Diamniadio, suivi de chantier.** Huit dates d'images satellite, de 2011 à mai 2026. On compare deux dates côte à côte : terrain nu en janvier 2020, tribunes en gros œuvre en avril 2021, stade livré en mars 2022.

Les outils, sur la barre du bas :

- frise des dates ;
- mesure de distance et de surface ;
- notes géolocalisées ;
- comparaison avant/après avec un curseur ;
- vue 3D avec relief et bâtiments ;
- simulation d'inondation (Médina Gounass).

En haut à droite :

- **Copier le lien** ouvre exactement la même vue : projet, date, position, modes.
- **Exporter l'image** produit un JPEG avec les sources imprimées en bas de l'image.

## Lancer la démo sur ton ordinateur

Il faut Python 3 (déjà installé sur macOS) et une connexion Internet, car les images sont chargées en direct.

```bash
python3 scripts/serve.py
```

Ouvre ensuite http://localhost:8765 dans le navigateur.

## La mettre en ligne pour la montrer

Le dossier est un site statique : il n'y a rien à compiler.

- **Le plus simple : Netlify Drop.** Va sur https://app.netlify.com/drop et glisse-y le dossier `gisgis-demo`. Tu obtiens une adresse publique en quelques secondes. Il faut un compte gratuit pour garder le site en ligne.
- **GitHub Pages.** Pousse le dossier dans un dépôt, puis active Pages dans les réglages du dépôt (branche `main`, dossier racine).

## Ce qui est réel, ce qui est fictif

Sont réels :

- les lieux ;
- les images satellite et leurs dates ;
- l'orthophoto drone ;
- les bâtiments, les rues, les bassins existants et l'emprise du stade (OpenStreetMap) ;
- le relief.

Sont fictifs : les projets, les plans, les notes, les auteurs et les statuts. L'interface l'indique (« Démo : plans et notes fictifs », mention « exemple » sur chaque note).

La simulation d'inondation est indicative. Elle s'appuie sur un relief de 30 m de résolution (SRTM) et ne remplace pas une étude hydraulique.

## Sources et licences

| Donnée | Source | Licence |
| --- | --- | --- |
| Imagerie satellite et archives | Esri World Imagery, Wayback (Maxar, Vantor) | Conditions d'Esri |
| Orthophoto drone, Médina Gounass | WeRobotics, via OpenAerialMap | CC BY 4.0 |
| Bâtiments, rues, bassins, stade | OpenStreetMap, servi par OpenFreeMap | ODbL |
| Relief | AWS Terrain Tiles (SRTM) | Données ouvertes |
| Carte | MapLibre GL JS 5.24 (dans `vendor/`) | BSD 3-Clause |

Les fichiers de `data/` tirés d'OpenStreetMap restent sous licence ODbL, avec l'attribution « © contributeurs OpenStreetMap ».

L'imagerie Esri convient pour une démonstration. Pour un service commercial, il faudra une imagerie sous licence (achat d'images, ou les orthophotos de tes partenaires drone) ou un compte Esri adapté.

## Organisation des fichiers

```
index.html             structure de la page
css/app.css            styles (couleurs et typographie en tête de fichier)
js/projects.js         les projets : dates d'images, couches, notes, sources
js/main.js             la carte et les outils
js/geo.js              calculs de distance et de surface, formats en français
data/                  bâtiments, analyse du relief, plan, emprise du stade
scripts/prepare_data.py  régénère data/ à partir d'OpenStreetMap et du relief
scripts/serve.py       petit serveur local sans cache
vendor/maplibre-gl/    bibliothèque cartographique
```

## Ajouter un projet

1. Ajoute un objet dans `PROJECTS`, dans `js/projects.js`. Il contient le nom, la position, les dates d'images (numéro de version Wayback), les couches et les notes.
2. Si le projet a besoin de bâtiments ou d'une analyse de relief, adapte `scripts/prepare_data.py`, puis relance-le :

```bash
python3 scripts/prepare_data.py
```

Les dates d'images Wayback se retrouvent sur https://livingatlas.arcgis.com/wayback : choisis le lieu, puis note le numéro de version de chaque date utile.
