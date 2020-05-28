import { Project, ts, Symbol, createWrappedNode, Type, TypeNode, TypeChecker } from "ts-morph";
import * as tsm from "ts-morph";
import * as process from "process";

import { textChangeRangeIsUnchanged } from "typescript";
function fqn(t: Symbol[]) {
	return t.map((s) => s.getFullyQualifiedName());
}

function isInternalType(t: Type) {
	if (t.isLiteral() || t.isUndefined() || t.isNull() || t.isUnknown() || t.isAny() || t.isNumber() || t.isString())
		return true;
}

function mapToProperties(tc: TypeChecker, t: Type): TypeNode {
	if (isInternalType(t)) return tsm.createWrappedNode(ts.createTypeReferenceNode(t.getText(), []));
	if (t.isArray()) {
		//const p = ts.createPrinter();
		//p.

		return tsm.createWrappedNode(
			ts.createArrayTypeNode(mapToProperties(tc, t.getArrayElementTypeOrThrow()).compilerNode)
		);
	}
}

function typeOfSym(tc: TypeChecker, s: Symbol): Type | null {
	const ct = (s.compilerSymbol as any).type as ts.Type | null;
	if (!ct) return null;
	const type = (tc as any)._context.compilerFactory.getType(ct);
	return type;
}
const inpFile = process.argv[2];
if (!inpFile) throw Error("pass tsconfig path as argument");

async function go() {
	const project = new Project({
		tsConfigFilePath: inpFile,
	});

	let sfs = project.getSourceFiles();
	/*const sf = project.getSourceFile("CryptoTradingServer.ts");
	if (!sf) throw Error("could not find file");
	sfs = [sf];*/
	for (const sf of sfs) {
		const functions = [
			...sf.getDescendantsOfKind(ts.SyntaxKind.FunctionDeclaration),
			...sf.getDescendantsOfKind(ts.SyntaxKind.MethodDeclaration),
		];
		const TF = ts.TypeFormatFlags;
		console.log("TS version", ts.version);
		for (const fn of functions) {
			console.log(fn.getName());
			if (fn.getReturnTypeNode()) continue;
			//if (fn.getName() !== "getDeposit") continue;
			const returnType = fn.getReturnType();
			const rtText = returnType.getText(fn, TF.NoTruncation);
			//if(rtText.match(/import\(/)) continue;
			if (rtText.replace(/import\([^)]+\)/g, "aaaaa").length > 100000) continue;
			fn.setReturnType(rtText);
			continue;

			console.log(fn.getName() + ": " + rtText);
			console.log("apt", returnType.getTypeArguments()[0]?.getText(fn));
			const int = returnType.getTypeArguments()[0]?.getUnionTypes()[1];
			if (!int) continue;
			console.log("int", int.getText());
			// console.log("a", int.getProperties(), int.getApparentProperties(), int.getApparentType().getProperties());
			const tc = project.getTypeChecker();

			console.log(
				"aprop",
				int.getProperties().map((p) => p.getName())
			);
			console.log(
				"propt",
				Object.fromEntries(
					returnType.getProperties().map((p) => [
						p.getName(),
						typeOfSym(tc, p)?.getText() || "IDK",
						//tc.compilerObject.typeToString((p.compilerSymbol as any).type as ts.Type, fn.compilerNode),
					])
				)
			);
			/*console.log(
				"bprop",
				int.getProperties().map((p) => p.getDeclaredType().getText())
			);
			console.log(
				"cprop",
				int
					.getProperties()
					.map((p) =>
						project
							.getTypeChecker()
							.compilerObject.getTypeOfSymbolAtLocation(p.compilerSymbol, null)
							.getText()
					)
			);*/
			int.getProperties().map((p) => p.getName() + ": " + p.getDeclarations()[0].getType().getText());
			console.log("alias", int.getAliasSymbol()?.getFullyQualifiedName());
		}
		console.log("saving file", sf.getFilePath());
		await sf.save();
	}
}

go();
