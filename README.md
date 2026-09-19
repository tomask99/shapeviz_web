# Shapeviz Web

Repozitár projektu: https://github.com/tomask99/shapeviz_web

## Uloženie novej verzie

Každý commit uchováva jednu verziu projektu. Push ju odošle na GitHub.
Príkazy spúšťaj v priečinku projektu:

```powershell
git status
git diff
git add .
git diff --cached
git commit -m "Strucny popis zmeny"
git push origin main
```

Pred commitom skontroluj pripravené zmeny. Súbor `.gitignore` vynecháva
lokálne `.env` súbory, závislosti, logy a vygenerované výstupy.
Heslá a prístupové kľúče do zdrojových súborov nepatria.

## História a aktualizácia

```powershell
git log --oneline
git pull --ff-only
```

Pred prácou na inom počítači stiahni najnovšie zmeny cez `git pull --ff-only`.
História uložených verzií je dostupná aj v časti Commits na GitHube.

## Označenie vydania

Keď bude hotová prvá verzia na vydanie, môže dostať označenie:

```powershell
git tag -a v0.1.0 -m "Prva verzia"
git push origin v0.1.0
```

Pre ďalšie vydanie použi nové číslo, napríklad `v0.2.0`.
