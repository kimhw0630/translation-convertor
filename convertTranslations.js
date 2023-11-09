'use strict';
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const vm = require('vm');

// project Path
const projectPath =
  '/Users/i824749/Documents/01_Projects/03_CAAS/spartacus_develop_next_major/spartacus/';
// /Users/i824749/Documents/01_Projects/03_CAAS/spartacus_develop_next_major

// If "JSON_FOLDER" is defined, it will additionally copy JSON files to this specified location.
// If CREATE_JSON_FILES is set to true, then create JSON files in a specific location in Spartacus
// If the variable "UPDATE_IMPORT_FILES" is set to true, the script will update each index.ts file within the translation folder.
// It will modify the import statements in the index.ts files.
// If DELETE_TS_FILES is set to true, it will delete the TypeScript translation files after converting them to JSON.

const JSON_FOLDER = 'json_develop-next-major'; // create JSON files to given location
const CREATE_JSON_FILES = true; // create JSON files to Spartacus translation folder

const UPDATE_IMPORT_FILES = true; // update the import statements in the index.ts files
const DELETE_TS_FILES = true; // delete the TypeScript translation files after converting them to JSON

startConvertToJson();

/**
 * Initiates the conversion of translation files to JSON format.
 * Recreates the JSON folder, if necessary, based on the specified JSON_FOLDER.
 * Checks for translation files in 'feature-libs', 'integration-libs', and 'projects' paths.
 * Converts TypeScript files to JSON.
 * Deletes the TypeScript files
 */
function startConvertToJson() {
  recreateFolder(JSON_FOLDER);
  // path to check: look for translation files in below pathes
  const checkPathes = ['feature-libs', 'integration-libs', 'projects'];

  fs.access(projectPath, fs.constants.F_OK, (err) => {
    if (err) {
      console.error(`Folder does not exist: ${folderPath}`);
    } else {
      // Iterate through each checkPath
      for (const pathSegment of checkPathes) {
        const checkPath = `${projectPath}${pathSegment}`;
        if (pathSegment === 'projects') {
          convertTsToJson(checkPath, 'src/translations');
        } else {
          convertTsToJson(checkPath, 'assets/translations');
        }
      }
    }
  });
}
/**
 * Convert TypeScript files within a directory to JSON files
 * @param string directoryPath: root directory of project
 * @param string targetPath: location of target file e.g. "src/translations"
 */
function convertTsToJson(directoryPath, targetPath) {
  fs.readdir(directoryPath, (err, files) => {
    if (err) {
      console.error('Error reading directory:', err);
      return;
    }
    // Process each file and directory within the directory
    files.forEach((file) => {
      const filePath = path.join(directoryPath, file);
      fs.stat(filePath, (err, stats) => {
        if (err) {
          console.error('Error checking file stats:', err);
          return;
        }
        if (stats.isDirectory()) {
          if (isTranslationFolder(targetPath, filePath)) {
            fs.readdir(filePath, (err, subFiles) => {
              if (err) {
                console.error('Error reading sub-directory:', err);
                return;
              }
              let updateProjectIndexFile = false;
              subFiles.forEach(async (subFile) => {
                if (subFile === 'index.ts') {
                  const indexFilePath = filePath + '/' + subFile;
                  const translationInfos =
                    extractTranslationInfo(indexFilePath);
                  translationInfos.forEach(async (translationInfo) => {
                    const variablesObject = loadObjectsFromFile(
                      filePath + '/' + translationInfo.importedFileName
                    );
                    // Find the object with matching name
                    const selectedObject = variablesObject.find(
                      (obj) => obj.name === translationInfo.importedObjectName
                    );

                    const jsonStr = JSON.stringify(
                      selectedObject.value,
                      null,
                      2
                    );
                    createJsonFile(filePath, selectedObject.name, jsonStr);
                  });
                  updateImportStatement(indexFilePath, translationInfos);
                }
              });
              if (updateProjectIndexFile) {
                const indexFilePath = filePath + '/index.ts';
                const translationInfos = extractTranslationInfo(indexFilePath);
                updateImportStatement(indexFilePath, translationInfos);
                updateProjectIndexFile = false;
              }
            });
          } else {
            convertTsToJson(filePath, targetPath);
          }
        }
      });
    });
  });
}

function createJsonFile(filePath, objectName, content) {
  const jsonFile = objectName + '.json';
  // write to project folder
  if (CREATE_JSON_FILES) {
    if (!filePath.endsWith('/')) {
      filePath += '/';
    }
    fs.writeFileSync(filePath + jsonFile, content);
  }
  // write to JSON_FOLDER folder
  if (JSON_FOLDER) {
    fs.writeFileSync(JSON_FOLDER + '/' + jsonFile, content);
  }
}

/**
 * Reads and processes TypeScript files. It handles imports, tracks variable dependencies,
 * and transpiles TypeScript to JavaScript.
 * returns an array of objects containing variable names and their values.
 */
function loadObjectsFromFile(filePath) {
  const tsFilesFullPath = [];
  tsFilesFullPath.push(filePath);
  const fileContents = fs.readFileSync(filePath, 'utf-8');
  let sourceFile = ts.createSourceFile(
    filePath,
    fileContents,
    ts.ScriptTarget.ESNext,
    true
  );

  const importStatements = [];
  const orgVariableDeclarations = [];
  // check if TS file contains imports and saving original variables
  function visitNode(node) {
    if (ts.isImportDeclaration(node)) {
      importStatements.push(node);
    } else if (ts.isVariableDeclaration(node)) {
      const variableName = node.name.getText();
      orgVariableDeclarations.push(variableName);
    }
    ts.forEachChild(node, visitNode);
  }

  visitNode(sourceFile);

  // if import statement exist then get content and merge into original code file
  if (importStatements.length > 0) {
    const importedFileContents = [];
    const lastSlashIndex = filePath.lastIndexOf('/');
    const rootPath = filePath.substring(0, lastSlashIndex) + '/';

    // read and save imported file contents
    importStatements.forEach((importStatement) => {
      // Extract the imported file path from the import statement
      const importFile = getImportedFileName(importStatement);
      const importedFileContent = fs.readFileSync(
        rootPath + importFile,
        'utf-8'
      );
      tsFilesFullPath.push(rootPath + importFile);
      importedFileContents.push(importedFileContent);
    });
    // merge imported file contents with original file content
    const mergedSourceFile = ts.createSourceFile(
      filePath,
      importedFileContents.join('\n') + '\n' + fileContents,
      ts.ScriptTarget.ESNext,
      true
    );
    sourceFile = mergedSourceFile;
  }

  const objectNodes = [];
  // find/save all variable declarations
  function visit(node) {
    if (ts.isVariableDeclaration(node)) {
      objectNodes.push(node);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);

  // Transpile TypeScript to JavaScript code
  const printer = ts.createPrinter();
  const jsCode = objectNodes
    .map((node) => {
      return printer.printNode(ts.EmitHint.Unspecified, node, sourceFile);
    })
    .join('\n');

  const sandbox = {};
  vm.runInNewContext(jsCode, sandbox, { filename: filePath });

  // delete TS files
  if (DELETE_TS_FILES) {
    tsFilesFullPath.forEach((file) => {
      deleteFile(file);
    });
  }

  // Return an array of objects with variable names and their corresponding values
  return orgVariableDeclarations.map((variable) => {
    const value = sandbox[variable];
    return {
      name: variable,
      value: value,
    };
  });
}

/**
 * extracts translation information from index.ts file.
 * @param string tsFilePath
 * @returns
 */
function extractTranslationInfo(tsFilePath) {
  const tsFileContent = fs.readFileSync(tsFilePath, 'utf-8');
  const sourceFile = ts.createSourceFile(
    tsFilePath,
    tsFileContent,
    ts.ScriptTarget.Latest,
    true
  );

  let importObjects = [];
  ts.forEachChild(sourceFile, (node) => {
    if (ts.isImportDeclaration(node)) {
      importObjects.push({
        importedFileName: getImportedFileName(node),
        importedObjectName: getImportedObjectName(node),
      });
    }
  });

  return importObjects;
}
/**
 * Function to extract imported file names from a text node
 * @param node: abstract syntax tree
 * @returns
 */
function getImportedFileName(node) {
  let result = '';
  const matches = node.getText().match(/from ['"](.*)['"]/);
  if (matches && matches[1]) {
    result = matches[1].replace(/\.\//, '') + '.ts';
  }
  return result;
}
/**
 * Function to extract the imported object name from a text node
 * @param node: abstract syntax tree
 * @returns
 */
function getImportedObjectName(node) {
  let result = '';
  const matches = node.getText().match(/{([^}]*)}/);
  if (matches && matches.length > 1) {
    result = matches[1].trim();
  }
  return result;
}
/**
 * update import statement in index file.  remove TS import statements and replace with JSON
 * @param string filePath
 * @param string ImportedObjectName translationInfo.importedObjectName
 */
function updateImportStatement(filePath, translationInfos) {
  if (!UPDATE_IMPORT_FILES) {
    return;
  }
  fs.readFile(filePath, 'utf8', async (err, data) => {
    if (err) {
      console.error(err);
      return;
    }

    const lines = data.split('\n');
    translationInfos.forEach((translationInfo) => {
      const searchString =
        'import { ' + translationInfo.importedObjectName + ' } from ';
      const replacementLine =
        'import ' +
        translationInfo.importedObjectName +
        " from './" +
        translationInfo.importedObjectName +
        ".json';";
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(searchString)) {
          lines[i] = replacementLine;
          break;
        }
      }
    });
    const updatedContent = lines.join('\n');

    fs.writeFileSync(filePath, updatedContent, 'utf8', (err) => {
      if (err) {
        console.error(err);
        return;
      }
    });
  });
}
/**
 * Function to determine if a given path corresponds to a translation folder
 * @param string parentFolderName:  src/translations or assets/translations
 * @param string givenPath: current path
 * @returns
 */
function isTranslationFolder(parentFolderName, givenPath) {
  const parentFolderNames = parentFolderName
    .split('/')
    .filter((segment) => segment.trim() !== '');

  const pathSegments = givenPath
    .split('/')
    .filter((segment) => segment.trim() !== '');

  return (
    pathSegments.length > 2 &&
    pathSegments[pathSegments.length - 3] === parentFolderNames[0] &&
    pathSegments[pathSegments.length - 2] === parentFolderNames[1]
  );
}
function deleteFile(filePath) {
  fs.unlinkSync(filePath, (err) => {
    if (err) {
      console.error('Error occurred:', err);
      return;
    }
  });
}

function recreateFolder(folderPath) {
  if (JSON_FOLDER) {
    if (fs.existsSync(folderPath)) {
      fs.rmSync(folderPath, { recursive: true, force: true }); // Use fs.rmSync for synchronous operation
    }
    fs.mkdirSync(folderPath, { recursive: true });
  }
}

// console.log(process.cwd());
// /Users/i824749/Documents/01_Projects/03_CAAS/Translation/translation-convertor
