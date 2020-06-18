import {
  Project,
  ts,
  Symbol,
  SourceFile,
  SyntaxKind,
  Identifier,
  TypeReferenceNode,
} from "ts-morph";
import { setEmitFlags } from "typescript";
import * as process from "process";

function fqn(t: Symbol[]) {
  return t.map((s) => s.getFullyQualifiedName());
}

function camelize(str: string) {
  return str
    .replace(/[^a-z0-9]/gi, " ")
    .replace(/(?:^\w|[A-Z]|\b\w)/g, function (word, index) {
      return index === 0 ? word.toLowerCase() : word.toUpperCase();
    })
    .replace(/\s+/g, "");
}

const nameBlacklist = new Set(["index", "common", "types"]);

function getNiceName(sf: SourceFile, checkAvailable: (t: string) => boolean) {
  const fname = sf.getBaseNameWithoutExtension();
  const dirname = sf.getDirectory().getBaseName();
  const res = [
    fname,
    dirname.split("-")[0] + " " + fname,
    dirname + " " + fname,
    fname + "_",
  ]
    .map(camelize)
    .find(checkAvailable);
  if (res) return res;
  let i = 2;
  while (true) {
    if (checkAvailable(fname + i)) return fname + i;
    i++;
    if (i > 10 && Math.random() > 0.5) i++;
  }
}

function getReferencedSourceFileFromSymbol(symbol: Symbol) {
  const declarations = symbol.getDeclarations();
  if (
    declarations.length === 0 ||
    declarations[0].getKind() !== SyntaxKind.SourceFile
  )
    return undefined;
  return declarations[0] as SourceFile;
}

function beautifyImportPath(path: string): string {
  return path.replace(/.*\/node_modules\//, "").replace(/^@types\//, "");
}

const inpFile = process.argv[2];
if (!inpFile) throw Error("pass tsconfig path as argument");

async function go() {
  const project = new Project({
    tsConfigFilePath: inpFile,
  });
  let sfs = project.getSourceFiles();
  /*const sf = project.getSourceFile("chat.ts");
	if (!sf) throw Error("could not find file");
	sfs = [sf];*/
  for (const sf of sfs) {
    let madeChanges = Infinity;
    while (madeChanges > 0) {
      madeChanges = 0;
      const imptypes = [...sf.getDescendantsOfKind(ts.SyntaxKind.ImportType)];
      const TF = ts.TypeFormatFlags;
      // project.resol
      project.getProgram;
      const todoMap = new Map<string, SourceFile>();
      const toReplace = [];
      for (const impt of imptypes) {
        const sym = impt.getSymbol();
        if (!sym) {
          throw new Error(
            "could not get the referenced symbol for " + impt.getText()
          );
        }
        const referencedModule = getReferencedSourceFileFromSymbol(sym);
        if (!referencedModule) {
          console.warn("could not get referenced module for ", impt.getText());
          continue;
        }
        todoMap.set(referencedModule.getFilePath(), referencedModule);
        toReplace.push({ node: impt, mod: referencedModule.getFilePath() });
        break; // only one at a time for now
      }

      const allNames = new Set(
        sf
          .getSymbolsInScope(0b1111111111111111111111111111)
          .map((x) => x.getName())
      );
      const nameMap = new Map<string, SourceFile>();
      const todos = [...todoMap.values()];
      while (todos.length > 0) {
        const referencedModule = todos.shift();
        if (!referencedModule) throw Error("impossible");
        const myName = getNiceName(
          referencedModule,
          (m) => !allNames.has(m) && !nameBlacklist.has(m)
        );
        const other = nameMap.get(myName);
        if (other) {
          todos.push(other);
          allNames.add(myName); // reserve because is dupe
          nameMap.delete(myName);
        }
        nameMap.set(myName, referencedModule);
      }

      const inverseMap = new Map<string, Identifier>();

      /*const existingImports = sf.getImportDeclarations().flatMap(imp => {
				const sf = imp.getModuleSpecifierSourceFile();
				const nsimp = imp.getNamespaceImport();
				if(!sf || !nsimp) return [];
				return [[sf.getFilePath(), nsimp]] as const
			})
			sf.getImportDeclaration()*/
      for (const [name, referencedModule] of nameMap) {
        let importdecl = sf.getImportDeclaration(
          (d) =>
            d.getModuleSpecifierSourceFile()?.getFilePath() ===
              referencedModule.getFilePath() && !!d.getNamespaceImport()
        );
        if (!importdecl) {
          importdecl = sf.addImportDeclaration({
            namespaceImport: name,
            moduleSpecifier: beautifyImportPath(
              sf.getRelativePathAsModuleSpecifierTo(referencedModule)
            ),
          });
        }
        inverseMap.set(
          referencedModule.getFilePath(),
          importdecl.getNamespaceImportOrThrow()
        );
      }

      for (const { node, mod } of toReplace) {
        const id = inverseMap.get(mod);
        if (!id) throw Error("no identifier found for " + mod);
        //const tsr = ts.createTypeReferenceNode(ts.createQualifiedName(id.compilerNode, quali.compilerNode as ts.Identifier), node.getTypeArguments().map(x => x.compilerNode));
        // node.replaceWithText(tsr.getText());

        try {
          node.replaceWithText(
            id.getText() +
              node
                .getText()
                .substr(("import()" + node.getArgument().getText()).length)
          );
          madeChanges++;
        } catch (e) {
          if (e.message.includes("removed or forgotten")) continue;
          else throw e;
        }
      }
    }

    console.log("saving file", sf.getFilePath());
    await sf.save();
  }
}

go();
