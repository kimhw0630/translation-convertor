# translation-convertor

This script will convert translation files, which are written in TypeScript, into JSON files.

To run the script, use the node command followed by the script's filename:
change the projectPath value in the script line 8 then

node convertTranslations.js

## to use JSON files in Spartacus

- enable lines 58 to 61; this action will copy each converted JSON file to the Spartacus folder.
- update each index.ts file in the folder

  e.g.
  change
  import { importExport } from './import-export.i18n';
  to
  import importExport from './importExport.json';

  - notes: json file name will be same as the object name (e.g. importExport.json)
