import type {
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

import { buildUseCaseExamples } from './example/build';
import type { ProfileHeader } from './header';
import type { EnumModel } from './models/enum.model';
import type { ListModel } from './models/list.model';
import type { Model } from './models/model-base';
import { ModelType } from './models/model-base';
import type { ObjectModel } from './models/object.model';
import type { ScalarModel, ScalarType } from './models/scalar.model';
import type { UnionModel } from './models/union.model';
import type { Profile } from './profile';
import type { UseCase } from './usecase';
import type { UseCaseBase } from './usecase-base';
import type { UseCaseDetail } from './usecase-detail';

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

  private getGenericModelDetails(astType?: Type, nonNull?: boolean): Model {
    if (astType === undefined) {
      return null;
    }
    switch (astType.kind) {
      case 'ObjectDefinition':
        return this.getObjectModelDetails(astType, nonNull);
      case 'PrimitiveTypeName':
        return this.getScalarModelDetails(astType, nonNull);
      case 'ListDefinition':
        return this.getListModelDetails(astType, nonNull);
      case 'EnumDefinition':
        return this.getEnumModelDetails(astType, nonNull);
      case 'ModelTypeName': {
        const node = this.findNamedModelDefinition(astType.name);

        return this.getGenericModelDetails(node.type);
      }
      case 'NonNullDefinition':
        return this.getGenericModelDetails(astType.type, true);
      case 'UnionDefinition':
        return this.getUnionModelDetails(astType, nonNull);
      default:
        return null;
    }
  }

  private getScalarModelDetails(
    primitive: PrimitiveTypeNameNode,
    nonNull?: boolean
  ): ScalarModel {
    return {
      modelType: ModelType.SCALAR,
      nonNull,
      scalarType: primitive.name as ScalarType,
    } as ScalarModel;
  }

  private getListModelDetails(
    list: ListDefinitionNode,
    nonNull?: boolean
  ): ListModel {
    return {
      modelType: ModelType.LIST,
      nonNull,
      model: this.getGenericModelDetails(list.elementType),
    } as ListModel;
  }

  private getObjectModelDetails(
    object: ObjectDefinitionNode,
    nonNull?: boolean
  ): ObjectModel {
    return {
      modelType: ModelType.OBJECT,
      nonNull,
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
            nonNull: model?.nonNull,
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

  private getEnumModelDetails(
    object: EnumDefinitionNode,
    nonNull?: boolean
  ): EnumModel {
    return {
      modelType: ModelType.ENUM,
      nonNull: nonNull ?? false,
      enumElements: object.values.map(({ value, documentation }) => ({
        value,
        title: documentation?.title,
      })),
    };
  }

  private getUnionModelDetails(
    object: UnionDefinitionNode,
    nonNull?: boolean
  ): UnionModel {
    return {
      nonNull: nonNull ?? true,
      modelType: ModelType.UNION,
      types: object.types.map(t => this.getGenericModelDetails(t)),
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

    return {
      ...this.mapUseCaseBase(usecase),
      error: resolvedErrorTree,
      input: resolvedInputTree,
      result: resolvedResultTree,
      ...buildUseCaseExamples(this.options, usecase.useCaseName),
    };
  }
}
