"use strict";
const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const vm = require("vm");

// project Path
const projectPath =
  "/Users/i824749/Documents/01_Projects/03_CAAS/spartacus_2023_July/spartacus/";

function convertTsToJson(directoryPath, targetPath) {
  fs.readdir(directoryPath, (err, files) => {
    if (err) {
      console.error("Error reading directory:", err);
      return;
    }
    // Process each file and directory within the directory
    files.forEach((file) => {
      const filePath = path.join(directoryPath, file);
      fs.stat(filePath, (err, stats) => {
        if (err) {
          console.error("Error checking file stats:", err);
          return;
        }
        if (stats.isDirectory()) {
          if (filePath.endsWith(targetPath)) {
            fs.readdir(filePath, (err, subFiles) => {
              if (err) {
                console.error("Error reading sub-directory:", err);
                return;
              }
              subFiles.forEach((subFile) => {
                // Skip files named "index.ts"
                if (subFile !== "index.ts") {
                  const variablesObject = loadObjectsFromFile(
                    filePath + "/" + subFile
                  );
                  if (variablesObject.length > 0) {
                    const mergedObject = mergeVariables(variablesObject);
                    const jsonStr = JSON.stringify(mergedObject, null, 2);
                    fs.writeFileSync(
                      "json/" + replaceFileExtension(subFile, "json"),
                      jsonStr
                    );
                  }
                }
              });
            });
          } else {
            convertTsToJson(filePath, targetPath);
          }
        }
      });
    });
  });
}

/**
 * takes an array of objects with name and value properties, and merges them into a single object
 */
function mergeVariables(variablesObject) {
  function createObject(name, value) {
    const obj = {};
    obj[name] = value;
    return obj;
  }

  const objects = variablesObject.map(({ name, value }) =>
    createObject(name, value)
  );

  const mergedObject = objects.reduce((result, obj) => {
    return { ...result, ...obj };
  }, {});

  return mergedObject;
}

/**
 * replaces the file extension of a given file name with a new extension
 */
function replaceFileExtension(fileName, newExtension) {
  const parts = fileName.split(".");
  if (parts.length > 1) {
    parts[parts.length - 1] = newExtension;
    return parts.join(".");
  }
  return fileName;
}

/**
 * Reads and processes TypeScript files. It handles imports, tracks variable dependencies,
 * and transpiles TypeScript to JavaScript.
 * returns an array of objects containing variable names and their values.
 */
function loadObjectsFromFile(filePath) {
  const fileContents = fs.readFileSync(filePath, "utf-8");
  let sourceFile = ts.createSourceFile(
    filePath,
    fileContents,
    ts.ScriptTarget.ESNext,
    true
  );
  // check if TS file contains imports
  const importStatements = [];
  const orgVariableDeclarations = [];
  sourceFile.statements.forEach((node) => {
    if (ts.isImportDeclaration(node)) {
      importStatements.push(node.getText());
    }
  });

  if (importStatements.length > 0) {
    // saving original varible declarations before adding imports ones so we can remove imports later
    function visitforCheck(node) {
      if (ts.isVariableDeclaration(node)) {
        const variableName = node.name.getText();
        orgVariableDeclarations.push(variableName);
      }
      ts.forEachChild(node, visitforCheck);
    }
    ts.forEachChild(sourceFile, visitforCheck);

    const importedFileContents = [];
    const lastSlashIndex = filePath.lastIndexOf("/");
    const rootPath = filePath.substring(0, lastSlashIndex) + "/";

    // read and save imported file contents
    importStatements.forEach((importStatement) => {
      // Extract the imported file path from the import statement
      const matches = importStatement.match(/from ['"](.*)['"]/);
      if (matches && matches[1]) {
        const importedFilePath =
          rootPath + matches[1].replace(/\.\//, "") + ".ts";
        const importedFileContent = fs.readFileSync(importedFilePath, "utf-8");
        importedFileContents.push(importedFileContent);
      }
    });
    // merge imported file contents with original file content
    const mergedSourceFile = ts.createSourceFile(
      filePath,
      importedFileContents.join("\n") + "\n" + fileContents,
      ts.ScriptTarget.ESNext,
      true
    );
    sourceFile = mergedSourceFile;
  }

  const objectNodes = [];
  const variableDependencies = new Map();

  function visit(node) {
    if (ts.isVariableDeclaration(node)) {
      objectNodes.push(node);
      const dependencies = [];
      ts.forEachChild(node.initializer, (childNode) => {
        if (ts.isIdentifier(childNode)) {
          dependencies.push(childNode.text);
        }
      });
      variableDependencies.set(node.name.getText(), dependencies);
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  const sortedVariables = [];
  const visitedVariables = new Set();

  function visitVariable(variable) {
    if (!visitedVariables.has(variable)) {
      visitedVariables.add(variable);
      const dependencies = variableDependencies.get(variable) || [];
      dependencies.forEach(visitVariable);
      sortedVariables.push(variable);
    }
  }

  // Topological sort to visit variables in the correct order based on dependencies
  objectNodes.forEach((node) => {
    visitVariable(node.name.getText());
  });

  // Transpile TypeScript to JavaScript code
  const printer = ts.createPrinter();
  const jsCode = sortedVariables
    .map((variable) => {
      const node = objectNodes.find((node) => node.name.getText() === variable);
      return printer.printNode(ts.EmitHint.Unspecified, node, sourceFile);
    })
    .join("\n");

  const sandbox = {};
  vm.runInNewContext(jsCode, sandbox, { filename: filePath });

  let resultList = [];
  if (importStatements.length > 0) {
    resultList = orgVariableDeclarations;
  } else {
    resultList = sortedVariables;
  }

  // Return an array of objects with variable names and their corresponding values
  return resultList.map((variable) => {
    const value = sandbox[variable];
    return {
      name: variable,
      value: value,
    };
  });
}

// ----------------------------------------------------------------
// START PUBLIC

if (fs.existsSync("json")) {
  fs.rmdirSync("json", { recursive: true });
}
fs.mkdirSync("json", { recursive: true });

// path to check
const checkPaths = ["feature-libs", "integration-libs", "projects"];
// path where resource files are located
const targetPath = "/translations/en";

fs.access(projectPath, fs.constants.F_OK, (err) => {
  if (err) {
    console.error(`Folder does not exist: ${folderPath}`);
  } else {
    // Iterate through each checkPath
    for (const pathSegment of checkPaths) {
      const fullPath = `${projectPath}${pathSegment}`;
      convertTsToJson(fullPath, targetPath);
    }
  }
});
