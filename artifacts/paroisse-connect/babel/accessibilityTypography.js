/**
 * Central accessibility typography scale.
 *
 * The app uses React Native styles directly across many routes, so applying
 * this at the Babel boundary keeps the same scale on iOS, Android, and Web
 * without duplicating edits in every screen.
 */
function accessibleTypography() {
  const staticPropNames = new Set([
    "title", "label", "placeholder", "message", "description", "confirmLabel",
    "cancelLabel", "accessibilityLabel", "emptyText", "errorText", "buttonTitle",
  ]);

  function isProjectFile(path) {
    const filename = path.hub?.file?.opts?.filename || "";
    const normalizedFilename = `/${filename.replace(/\\/g, "/")}`;
    return Boolean(filename) &&
      !normalizedFilename.includes("/node_modules/") &&
      !normalizedFilename.includes("/static-build/") &&
      ["/app/", "/components/", "/constants/", "/context/", "/hooks/", "/lib/"].some(
        (projectDirectory) => normalizedFilename.includes(projectDirectory),
      );
  }

  function addI18nImport(path) {
    if (!isProjectFile(path)) return;
    const program = path.findParent((parent) => parent.isProgram());
    if (!program) return;
    const importDeclaration = program.node.body.find((node) =>
      node.type === "ImportDeclaration" &&
      node.source.value === "@/context/I18nContext"
    );
    const requiredImports = ["translateStatic"];

    if (importDeclaration) {
      const importedNames = new Set(
        importDeclaration.specifiers
          .filter((specifier) => specifier.type === "ImportSpecifier")
          .map((specifier) => specifier.imported.name),
      );
      requiredImports.forEach((name) => {
        if (!importedNames.has(name)) {
          importDeclaration.specifiers.push({
            type: "ImportSpecifier",
            imported: { type: "Identifier", name },
            local: { type: "Identifier", name },
          });
        }
      });
    } else {
      program.unshiftContainer("body", {
        type: "ImportDeclaration",
        specifiers: requiredImports.map((name) => ({
          type: "ImportSpecifier",
          imported: { type: "Identifier", name },
          local: { type: "Identifier", name },
        })),
        source: { type: "StringLiteral", value: "@/context/I18nContext" },
      });
    }
    // Metro must know about the bindings before it lowers generated nodes.
    program.scope.crawl();
  }

  return {
    name: "paroisse-connect-accessibility-typography",
    visitor: {
      JSXElement(path) {
        if (!isProjectFile(path)) return;
        const opening = path.node.openingElement;
        if (!opening || opening.name.type !== "JSXIdentifier" || opening.name.name !== "Text") return;
        const children = path.node.children;
        if (children.length !== 1 || children[0].type !== "JSXText") return;
        const source = children[0].value.replace(/\s+/g, " ").trim();
        if (!source) return;
        children[0] = {
          type: "JSXExpressionContainer",
          expression: {
            type: "CallExpression",
            callee: {
              type: "MemberExpression",
              computed: false,
              object: {
                type: "CallExpression",
                callee: { type: "Identifier", name: "require" },
                arguments: [{ type: "StringLiteral", value: "@/context/I18nContext" }],
              },
              property: { type: "Identifier", name: "translateStatic" },
            },
            arguments: [{ type: "StringLiteral", value: source }],
          },
        };
      },
      JSXAttribute(path) {
        if (!isProjectFile(path)) return;
        const name = path.node.name;
        const value = path.node.value;
        if (name.type !== "JSXIdentifier" || !staticPropNames.has(name.name)) return;
        if (!value || value.type !== "StringLiteral") return;
        addI18nImport(path);
        path.node.value = {
          type: "JSXExpressionContainer",
          expression: {
            type: "CallExpression",
            callee: { type: "Identifier", name: "translateStatic" },
            arguments: [{ type: "StringLiteral", value: value.value }],
          },
        };
      },
      ObjectProperty(path) {
        if (!isProjectFile(path)) return;
        const key = path.node.key;
        const value = path.node.value;
        const keyName = key && (key.name || key.value);

        if (keyName === "fontSize" && value && value.type === "NumericLiteral") {
          const size = value.value;
          if (size <= 11) value.value = 14;
          else if (size <= 13) value.value = 15;
          else if (size <= 15) value.value = 16;
          else if (size <= 17) value.value = 18;
        }

        // Small text styles often had line heights sized for 10–14px fonts.
        // Increase only compact line heights so larger text does not overlap.
        if (keyName === "lineHeight" && value && value.type === "NumericLiteral" && value.value <= 22) {
          value.value = Math.ceil(value.value * 1.12);
        }

        if (!staticPropNames.has(keyName) || !value || value.type !== "StringLiteral") return;
        addI18nImport(path);
        path.replaceWith({
          type: "ObjectMethod",
          kind: "get",
          key,
          computed: false,
          generator: false,
          async: false,
          params: [],
          body: {
            type: "BlockStatement",
            directives: [],
            body: [{
              type: "ReturnStatement",
              argument: {
                type: "CallExpression",
                callee: {
                  type: "MemberExpression",
                  computed: false,
                  object: {
                    type: "CallExpression",
                    callee: { type: "Identifier", name: "require" },
                    arguments: [{ type: "StringLiteral", value: "@/context/I18nContext" }],
                  },
                  property: { type: "Identifier", name: "translateStatic" },
                },
                arguments: [value],
              },
            }],
          },
        });
      },
      CallExpression(path) {
        if (!isProjectFile(path)) return;
        const callee = path.node.callee;
        const isAlert = callee.type === "MemberExpression" &&
          callee.object.type === "Identifier" && callee.object.name === "Alert" &&
          callee.property.type === "Identifier" && callee.property.name === "alert";
        const isConfirm = callee.type === "MemberExpression" &&
          callee.object.type === "Identifier" && callee.object.name === "window" &&
          callee.property.type === "Identifier" && callee.property.name === "confirm";
        if (!isAlert && !isConfirm) return;
        const indexes = isAlert ? [0, 1] : [0];
        indexes.forEach((index) => {
          const argument = path.node.arguments[index];
          if (!argument || argument.type !== "StringLiteral") return;
          addI18nImport(path);
          path.node.arguments[index] = {
            type: "CallExpression",
            callee: { type: "Identifier", name: "translateStatic" },
            arguments: [argument],
          };
        });
      },
    },
  };
}

module.exports = accessibleTypography;