import type {
  ComlinkListLiteralNode,
  ComlinkLiteralNode,
  ComlinkObjectLiteralNode,
  ComlinkPrimitiveLiteralNode,
} from '@superfaceai/ast';

import type {
  ExampleArray,
  ExampleObject,
  ExampleScalar,
  UseCaseExample,
} from '../usecase-example';

export function parseObjectLiteral(
  node: ComlinkObjectLiteralNode
): ExampleObject {
  const properties: ({ name: string } & (
    | ExampleArray
    | ExampleScalar
    | ExampleObject
  ))[] = [];
  for (const field of node.fields) {
    if (field.value.kind === 'ComlinkPrimitiveLiteral') {
      properties.push({
        name: field.key.join('.'),
        ...parsePrimitiveLiteral(field.value),
      });
    } else if (field.value.kind === 'ComlinkListLiteral') {
      properties.push({
        name: field.key.join('.'),
        ...parseListLiteral(field.value),
      });
    } else {
      properties.push({
        name: field.key.join('.'),
        ...parseObjectLiteral(field.value),
      });
    }
  }

  return {
    kind: 'object',
    properties,
  };
}

export function parseListLiteral(node: ComlinkListLiteralNode): ExampleArray {
  const items: (ExampleArray | ExampleObject | ExampleScalar)[] = [];

  for (const item of node.items) {
    if (item.kind === 'ComlinkPrimitiveLiteral') {
      items.push(parsePrimitiveLiteral(item));
    } else if (item.kind === 'ComlinkListLiteral') {
      items.push(parseListLiteral(item));
    } else {
      items.push(parseObjectLiteral(item));
    }
  }

  return {
    kind: 'array',
    items,
  };
}

export function parsePrimitiveLiteral(
  node: ComlinkPrimitiveLiteralNode
): ExampleScalar {
  if (typeof node.value === 'boolean') {
    return { kind: 'boolean', value: node.value };
  } else if (typeof node.value === 'number') {
    return { kind: 'number', value: node.value };
  }

  return { kind: 'string', value: node.value };
}

export function parseLiteralExample(
  exampleNode: ComlinkLiteralNode
): UseCaseExample {
  if (exampleNode === undefined) {
    return undefined;
  }
  if (exampleNode.kind === 'ComlinkObjectLiteral') {
    return parseObjectLiteral(exampleNode);
  } else if (exampleNode.kind === 'ComlinkListLiteral') {
    return parseListLiteral(exampleNode);
  } else {
    return parsePrimitiveLiteral(exampleNode);
  }
}
