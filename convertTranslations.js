'use strict';
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const vm = require('vm');

// project Path
const projectPath =
  '/Users/i824749/Documents/01_Projects/03_CAAS/spartacus_2023_July/spartacus/';

/**
 * Convert TypeScript files within a directory to JSON files
 * @param string directoryPath: root directory of project
 * @param string targetPath: location of target file e.g. "/translations/en"
 * @param boolean useIndexFile: whether use index.ts file to get resource files"
 */
function convertTsToJson(directoryPath, targetPath, useIndexFile) {
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
          if (filePath.endsWith(targetPath)) {
            fs.readdir(filePath, (err, subFiles) => {
              if (err) {
                console.error('Error reading sub-directory:', err);
                return;
              }
              subFiles.forEach((subFile) => {
                if (subFile === 'index.ts' && useIndexFile) {
                  const translationInfo = extractTranslationInfo(
                    filePath + '/' + subFile
                  );
                  const variablesObject = loadObjectsFromFile(
                    filePath + '/' + translationInfo.importedFileName
                  );
                  // Find the object with matching name
                  const selectedObject = variablesObject.find(
                    (obj) => obj.name === translationInfo.enObject
                  );

                  const jsonStr = JSON.stringify(selectedObject.value, null, 2);
                  fs.writeFileSync(
                    'json/' + selectedObject.name + '.json',
                    jsonStr
                  );
                  // enable below code to copy JSON file to Spartcus directory
                  // e.g it will copy to ~/cart/base/assets/translations/en/cart.i18.json
                  // fs.writeFileSync(
                  //   filePath + '/' + selectedObject.name + '.json',
                  //   jsonStr
                  // );
                }
                if (subFile !== 'index.ts' && !useIndexFile) {
                  const variablesObject = loadObjectsFromFile(
                    filePath + '/' + subFile
                  );
                  // If there are loaded objects, merge and convert to JSON
                  if (variablesObject.length > 0) {
                    const jsonStr = JSON.stringify(
                      variablesObject[0].value,
                      null,
                      2
                    );
                    // Write JSON string to a new JSON file
                    fs.writeFileSync(
                      'json/' + variablesObject[0].name + '.json',
                      jsonStr
                    );
                  }
                }
              });
            });
          } else {
            convertTsToJson(filePath, targetPath, useIndexFile);
          }
        }
      });
    });
  });
}

/**
 * replaces the file extension of a given file name with a new extension
 */
function replaceFileExtension(fileName, newExtension) {
  const parts = fileName.split('.');
  if (parts.length > 1) {
    parts[parts.length - 1] = newExtension;
    return parts.join('.');
  }
  return fileName;
}

/**
 * Reads and processes TypeScript files. It handles imports, tracks variable dependencies,
 * and transpiles TypeScript to JavaScript.
 * returns an array of objects containing variable names and their values.
 */
function loadObjectsFromFile(filePath) {
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
 * // extracts translation information from index.ts file.
 * @param string tsFilePath
 * @returns
 */
function extractTranslationInfo(tsFilePath) {
  // Read the TS file content
  const tsFileContent = fs.readFileSync(tsFilePath, 'utf-8');

  // Parse the TypeScript source
  const sourceFile = ts.createSourceFile(
    tsFilePath,
    tsFileContent,
    ts.ScriptTarget.Latest,
    true
  );

  let importedFileName = '';
  let enObjectValue = '';
  // Recursive function to traverse the AST and extract "en" object value.
  function visitforCheck(node) {
    if (ts.isVariableDeclaration(node)) {
      if (node.name.text === 'en') {
        enObjectValue = node.initializer.getText();
        const pattern = /\b\w+\b/;
        const match = enObjectValue.match(pattern);
        enObjectValue = match ? match[0] : null;
      }
    }
    ts.forEachChild(node, visitforCheck);
  }

  // Traverse the AST to find import statements and "en" object assignment
  ts.forEachChild(sourceFile, (node) => {
    if (ts.isImportDeclaration(node)) {
      importedFileName = getImportedFileName(node);
    }
    ts.forEachChild(node, visitforCheck);
  });

  return {
    importedFileName: importedFileName,
    enObject: enObjectValue,
  };
}

function getImportedFileName(node) {
  let importedFileName = '';
  const matches = node.getText().match(/from ['"](.*)['"]/);
  if (matches && matches[1]) {
    importedFileName = matches[1].replace(/\.\//, '') + '.ts';
    importedFileName = importedFileName.replace('.json', ''); // in case when we modified to test index file
  }
  return importedFileName;
}

// START
// delete all json files then start
if (fs.existsSync('json')) {
  fs.rmdirSync('json', { recursive: true });
}
fs.mkdirSync('json', { recursive: true });

// path to check: look for translation files in below pathes
const checkPathes = ['feature-libs', 'integration-libs', 'projects'];
// path where resource files are located
const targetPath = '/translations/en';

fs.access(projectPath, fs.constants.F_OK, (err) => {
  if (err) {
    console.error(`Folder does not exist: ${folderPath}`);
  } else {
    // Iterate through each checkPath
    for (const pathSegment of checkPathes) {
      const checkPath = `${projectPath}${pathSegment}`;
      const useIndex = pathSegment !== 'projects';
      convertTsToJson(checkPath, targetPath, useIndex);
    }
  }
});
