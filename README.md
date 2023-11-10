# translation-convertor

This script will convert translation files, which are written in TypeScript, into JSON files.

To run the script, use the node command followed by the script's filename:
change the projectPath value in the script line 8 then

node convertTranslations.js

## Options in the script

- If "JSON_FOLDER" is defined, it will additionally copy JSON files to this specified location.
- If CREATE_JSON_FILES is set to true, then create JSON files in a specific location in Spartacus
- If the variable "UPDATE_IMPORT_FILES" is set to true, the script will update each index.ts file within the translation folder.
- It will modify the import statements in the index.ts files.
- If DELETE_TS_FILES is set to true, it will delete the TypeScript translation files after converting them to JSON.
