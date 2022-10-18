import type {
  ComlinkListLiteralNode,
  ComlinkLiteralNode,
  ComlinkObjectLiteralNode,
  ComlinkPrimitiveLiteralNode,
  EnumDefinitionNode,
  ListDefinitionNode,
  ModelTypeNameNode,
  NamedFieldDefinitionNode,
  NamedModelDefinitionNode,
  ObjectDefinitionNode,
  PrimitiveTypeNameNode,
  ProfileDocumentNode,
  Type,
  UnionDefinitionNode,
  UseCaseDefinitionNode,
} from '@superfaceai/ast';
import { inspect } from 'util';

import type { ProfileHeader } from './header';
import type { EnumModel } from './models/enum.model';
import type { ListModel } from './models/list.model';
import type { Model } from './models/model-base';
import { ModelType } from './models/model-base';
import type { ObjectModel } from './models/object.model';
import type { ScalarModel } from './models/scalar.model';
import { ScalarType } from './models/scalar.model';
import type { UnionModel } from './models/union.model';
import type { Profile } from './profile';
import type { UseCase } from './usecase';
import type { UseCaseBase } from './usecase-base';
import type { UseCaseDetail, UseCaseSlot } from './usecase-detail';
import type {
  ParsedExampleArray,
  ParsedExampleObject,
  ParsedExamplePrimitive,
  ParsedUseCaseSlotExample,
  UseCaseSlotExample,
} from './usecase-example';

export class ProfileASTAdapter implements Profile {
  private options: ProfileDocumentNode;
  private namedModelDefinitionsCache: {
    [key: string]: NamedModelDefinitionNode;
  };

  private namedFieldDefinitionsCache: {
    [key: string]: NamedFieldDefinitionNode;
  };

  constructor(options: ProfileDocumentNode) {
    this.options = options;
    this.namedFieldDefinitionsCache = {};
    this.namedModelDefinitionsCache = {};
  }

  public getProfileHeader(): ProfileHeader {
    const ast = this.options;
    const header = {
      name: this.getProfileName(ast),
      scope: this.getProfileScope(ast),
      title: this.getProfileTitle(ast),
      version: this.getProfileVersion(ast),
      description: this.getProfileDescription(ast),
    };

    return {
      profileId: header.scope ? `${header.scope}/${header.name}` : header.name,
      ...header,
    };
  }

  public getUseCaseList(): UseCase[] {
    const ast = this.options;

    return ast.definitions
      .filter(definition => {
        return definition.kind === 'UseCaseDefinition';
      })
      .map(usecase => this.getUseCase(usecase as UseCaseDefinitionNode));
  }

  public getUseCaseDetailList(): UseCaseDetail[] {
    const ast = this.options;

    return ast.definitions
      .filter(definition => {
        return definition.kind === 'UseCaseDefinition';
      })
      .map(usecase => this.mapUseCaseDetail(usecase as UseCaseDefinitionNode));
  }

  private getProfileName(ast: ProfileDocumentNode): string {
    return ast.header.name;
  }

  private getProfileScope(ast: ProfileDocumentNode): string {
    return ast.header.scope ?? '';
  }

  private getProfileTitle(ast: ProfileDocumentNode): string {
    return ast.header?.documentation?.title ?? '';
  }

  private getProfileVersion(ast: ProfileDocumentNode): string {
    return `${ast.header.version.major}.${ast.header.version.minor}.${ast.header.version.patch}`;
  }

  private getProfileDescription(ast: ProfileDocumentNode): string {
    return ast.header?.documentation?.description ?? '';
  }

  private populateCache(): void {
    this.namedModelDefinitionsCache = {};
    this.namedFieldDefinitionsCache = {};

    this.options.definitions.forEach(definition => {
      if (definition.kind === 'NamedFieldDefinition') {
        this.namedFieldDefinitionsCache[definition.fieldName] = definition;
      } else if (definition.kind === 'NamedModelDefinition') {
        this.namedModelDefinitionsCache[definition.modelName] = definition;
      }
    });
  }

  private findNamedModelDefinition(
    modelName: string
  ): NamedModelDefinitionNode {
    if (Object.keys(this.namedModelDefinitionsCache).length === 0)
      this.populateCache();

    return this.namedModelDefinitionsCache[modelName];
  }

  private findNamedFieldDefinition(
    fieldName: string
  ): NamedFieldDefinitionNode | null {
    if (Object.keys(this.namedFieldDefinitionsCache).length === 0)
      this.populateCache();

    return this.namedFieldDefinitionsCache[fieldName] ?? null;
  }

  private getFieldsOverview(item?: Type): string[] {
    if (item === undefined) return [];

    switch (item.kind) {
      case 'ObjectDefinition':
        return item.fields.map(field => {
          const namedFieldNode = this.findNamedFieldDefinition(field.fieldName);

          // always prefer inlined metadata over named field definition
          return (
            field?.documentation?.title ??
            namedFieldNode?.documentation?.title ??
            field.fieldName
          );
        });
      case 'ListDefinition':
        return this.getFieldsOverview(item.elementType);
      case 'ModelTypeName': {
        const node = this.findNamedModelDefinition(item.name);

        return this.getFieldsOverview(node.type);
      }
      case 'NonNullDefinition':
        return this.getFieldsOverview(item.type);
      case 'PrimitiveTypeName':
        return [item.name];
      case 'EnumDefinition':
        return [
          item.values.map(enumValue => String(enumValue.value)).join(', '),
        ];
      case 'UnionDefinition':
        // TODO: Solve union type rendering: https://github.com/superfaceai/air/issues/123
        if (item.types.every(type => type.kind === 'ModelTypeName')) {
          return [
            (item.types as ModelTypeNameNode[])
              .map(type => type.name)
              .join(' or '),
          ];
        } else {
          return ['more result variants'];
        }
      default:
        return [];
    }
  }

  private getGenericModelDetails(astType?: Type): Model {
    if (astType === undefined) {
      return null;
    }
    switch (astType.kind) {
      case 'ObjectDefinition':
        return this.getObjectModelDetails(astType);
      case 'PrimitiveTypeName':
        return this.getScalarModelDetails(astType);
      case 'ListDefinition':
        return this.getListModelDetails(astType);
      case 'EnumDefinition':
        return this.getEnumModelDetails(astType);
      case 'ModelTypeName': {
        const node = this.findNamedModelDefinition(astType.name);

        return this.getGenericModelDetails(node.type);
      }
      case 'NonNullDefinition':
        return this.getGenericModelDetails(astType.type);
      case 'UnionDefinition':
        return this.getUnionModelDetails(astType);
      default:
        return null;
    }
  }

  private getScalarModelDetails(primitive: PrimitiveTypeNameNode): ScalarModel {
    return {
      modelType: ModelType.SCALAR,
      scalarType: primitive.name as ScalarType,
    } as ScalarModel;
  }

  private getListModelDetails(list: ListDefinitionNode): ListModel {
    return {
      modelType: ModelType.LIST,
      elementModel: this.getGenericModelDetails(list.elementType),
    } as ListModel;
  }

  private getObjectModelDetails(object: ObjectDefinitionNode): ObjectModel {
    return {
      modelType: ModelType.OBJECT,
      fields: object.fields
        .filter(item => item.kind === 'FieldDefinition')
        .map(field => {
          const namedFieldNode = this.findNamedFieldDefinition(field.fieldName);

          const model = this.getGenericModelDetails(
            field.type ?? namedFieldNode?.type ?? undefined
          );

          const description: string | undefined =
            field?.documentation?.title !== undefined
              ? field?.documentation?.description ?? field?.documentation?.title
              : namedFieldNode !== null
              ? namedFieldNode.documentation?.description
              : undefined;

          return {
            fieldName: field.fieldName,
            required: field.required,
            model: model,

            // If the field has an inline title provided, use the description
            // from inlined definition only (or fallback to title if not present).

            // E.g. Named field definition could contain both title & description
            //      while the inline definition only has a title. These 2 definitions
            //      could possibly have different meanings, mixing title from one
            //      with the description from the other is not desirable.
            description,
          };
        }),
    } as ObjectModel;
  }

  private getEnumModelDetails(object: EnumDefinitionNode): EnumModel {
    return {
      modelType: ModelType.ENUM,
      enumElemets: object.values.map(({ value, documentation }) => ({
        value,
        title: documentation?.title,
      })),
    };
  }

  private getUnionModelDetails(object: UnionDefinitionNode): UnionModel {
    return {
      modelType: ModelType.UNION,
      types: object.types.map(this.getGenericModelDetails.bind(this)),
    };
  }

  private mapUseCaseBase(usecase: UseCaseDefinitionNode): UseCaseBase {
    return {
      name: usecase.useCaseName,
      title: usecase?.documentation?.title,
      description: usecase?.documentation?.description,
    };
  }

  private getUseCase(usecase: UseCaseDefinitionNode): UseCase {
    const inputs = this.getFieldsOverview(usecase?.input?.value);
    const outputs = this.getFieldsOverview(usecase?.result?.value);

    return {
      ...this.mapUseCaseBase(usecase),
      ...inputs,
      ...outputs,
    };
  }

  private pluralizeFirstWord(phrase: string): string {
    const [firstWord, ...words] = phrase.split(' ');

    return [`${firstWord}s`, ...words].join(' ');
  }

  private getUseCaseSlot(item: Model): UseCaseSlot {
    if (item === null) {
      throw new Error('Item is null');
    }
    switch (item.modelType) {
      case ModelType.OBJECT:
        return {
          title: 'object',
          fields: item.fields.map(field => ({
            fieldName: field.fieldName,
            description: field.description,
            required: field.required ?? false,
            ...(field?.model?.modelType === ModelType.SCALAR
              ? {
                  type: field?.model?.scalarType,
                }
              : field?.model?.modelType === ModelType.ENUM
              ? {
                  type: 'enum',
                  typeValues: field.model.enumElemets.map(el => el.value),
                }
              : null),
          })),
        };
      case ModelType.LIST: {
        const elementSlot = this.getUseCaseSlot(item.elementModel);

        return {
          title: `list of ${this.pluralizeFirstWord(elementSlot.title)}`,
          ...(elementSlot.fields ? { fields: elementSlot.fields } : null),
        };
      }
      case ModelType.ENUM:
        return {
          title: 'enum',
          fields: item.enumElemets.map(enumEl => ({
            fieldName: String(enumEl.value),
            description: enumEl.title,
            required: false,
          })),
        };
      case ModelType.SCALAR:
        return {
          title: item.scalarType,
        };
      case ModelType.UNION:
        return this.getUseCaseSlot(item.types[0]);
    }
  }

  private getUseCaseSlotExample(item: Model): UseCaseSlotExample {
    if (item === null) {
      throw new Error('Item is null');
    }
    const DEFAULT_OBJECT_FIELD: Model = {
      modelType: ModelType.SCALAR,
      scalarType: ScalarType.STRING,
    };

    const SCALAR_MAPPING: {
      [key in ScalarType]: string | number | boolean;
    } = {
      [ScalarType.STRING]: '',
      [ScalarType.NUMBER]: 42,
      [ScalarType.BOOLEAN]: true,
    };

    switch (item.modelType) {
      case ModelType.OBJECT: {
        return item.fields.reduce(
          (objectExample, field) =>
            Object.assign(objectExample, {
              [field.fieldName]: this.getUseCaseSlotExample(
                field?.model || DEFAULT_OBJECT_FIELD
              ),
            }),
          {}
        );
      }
      case ModelType.LIST: {
        const elementExample = this.getUseCaseSlotExample(item.elementModel);

        return elementExample;
      }
      case ModelType.ENUM:
        return item.enumElemets?.[0]?.value ?? null;
      case ModelType.SCALAR:
        return item.scalarType
          ? SCALAR_MAPPING[item.scalarType]
          : SCALAR_MAPPING[ScalarType.STRING];
      case ModelType.UNION:
        return this.getUseCaseSlotExample(item.types[0]);
      default:
        return null;
    }
  }

  private findUseCaseExample(
    usecase: UseCaseDefinitionNode
  ): {
    errorExample?: {
      input?: ComlinkLiteralNode;
      error?: ComlinkLiteralNode;
    };
    successExample?: {
      input?: ComlinkLiteralNode;
      result?: ComlinkLiteralNode;
    };
  } {
    let successExample = undefined;
    let errorExample = undefined;

    if (usecase.examples === undefined || usecase.examples.length === 0)
      return { successExample: undefined, errorExample: undefined };

    const exampleNodes = usecase.examples.filter(
      slot =>
        slot.kind === 'UseCaseSlotDefinition' &&
        slot.value.kind === 'UseCaseExample'
    );
    const successExampleNode = exampleNodes.find(example =>
      Boolean(example.value?.result)
    )?.value;

    const errorExampleNode = exampleNodes.find(example =>
      Boolean(example.value?.error)
    )?.value;

    console.log(
      'succ node',
      inspect(successExampleNode?.result?.value, true, 20)
    );

    if (successExampleNode !== undefined) {
      successExample = {
        input: successExampleNode.input?.value,
        result: successExampleNode.result?.value,
      };
    }

    if (errorExampleNode !== undefined) {
      errorExample = {
        input: errorExampleNode.input?.value,
        error: errorExampleNode.error?.value,
      };
    }

    return {
      successExample,
      errorExample,
    };
  }

  private parseObjectLiteral(
    node: ComlinkObjectLiteralNode
  ): ParsedExampleObject {
    const properties: ({ name: string } & (
      | ParsedExampleArray
      | ParsedExamplePrimitive
      | ParsedExampleObject
    ))[] = [];
    for (const field of node.fields) {
      if (field.value.kind === 'ComlinkPrimitiveLiteral') {
        properties.push({
          name: field.key.join('.'),
          ...this.parsePrimitiveLiteral(field.value),
        });
      } else if (field.value.kind === 'ComlinkListLiteral') {
        properties.push({
          name: field.key.join('.'),
          ...this.parseListLiteral(field.value),
        });
      } else {
        properties.push({
          name: field.key.join('.'),
          ...this.parseObjectLiteral(field.value),
        });
      }
    }

    return {
      kind: 'object',
      properties,
    };
  }

  private parseListLiteral(node: ComlinkListLiteralNode): ParsedExampleArray {
    const items: (
      | ParsedExampleArray
      | ParsedExampleObject
      | ParsedExamplePrimitive
    )[] = [];

    for (const item of node.items) {
      if (item.kind === 'ComlinkPrimitiveLiteral') {
        items.push(this.parsePrimitiveLiteral(item));
      } else if (item.kind === 'ComlinkListLiteral') {
        items.push(this.parseListLiteral(node));
      } else {
        items.push(this.parseObjectLiteral(item));
      }
    }

    return {
      kind: 'array',
      items,
    };
  }

  private parsePrimitiveLiteral(
    node: ComlinkPrimitiveLiteralNode
  ): ParsedExamplePrimitive {
    if (typeof node.value === 'boolean') {
      return { kind: 'boolean', value: node.value };
    } else if (typeof node.value === 'number') {
      return { kind: 'number', value: node.value };
    }

    return { kind: 'string', value: node.value };
  }

  private parseLiteralExample(
    exampleNode: ComlinkLiteralNode
  ): ParsedUseCaseSlotExample {
    switch (exampleNode?.kind) {
      case 'ComlinkObjectLiteral': {
        return this.parseObjectLiteral(exampleNode);
      }
      case 'ComlinkListLiteral': {
        return this.parseListLiteral(exampleNode);
      }
      case 'ComlinkPrimitiveLiteral':
        return this.parsePrimitiveLiteral(exampleNode);
      default:
        throw new Error('unknown type');
    }
  }

  private mapUseCaseDetail(usecase: UseCaseDefinitionNode): UseCaseDetail {
    const resolvedInputTree = this.getGenericModelDetails(
      usecase?.input?.value
    );

    const resolvedResultTree = this.getGenericModelDetails(
      usecase?.result?.value
    );

    const resolvedErrorTree = this.getGenericModelDetails(
      usecase?.error?.value
    );

    const { successExample, errorExample } = this.findUseCaseExample(usecase);

    return {
      ...this.mapUseCaseBase(usecase),
      error: this.getUseCaseSlot(resolvedErrorTree),
      input: this.getUseCaseSlot(resolvedInputTree),
      result: this.getUseCaseSlot(resolvedResultTree),
      successExample: {
        input: successExample?.input
          ? this.parseLiteralExample(successExample.input)
          : undefined,
        result: successExample?.result
          ? this.parseLiteralExample(successExample.result)
          : undefined,
      },
      errorExample: {
        input: errorExample?.input
          ? this.parseLiteralExample(errorExample.input)
          : undefined,
        error: errorExample?.error
          ? this.parseLiteralExample(errorExample.error)
          : undefined,
      },
    };
  }
}
