export default `[{{#each items}}{{newLine (inc ../intent 2) }}{{#ifeq kind "primitive"}}{{>Primitive }},{{/ifeq}}{{#ifeq kind "object"}}{{>Object use=":" intent=(inc ../intent 2) }},{{/ifeq}}{{#ifeq kind "array"}}{{>Array use=":" intent= (inc ../intent 2) }},{{/ifeq}}{{/each}}{{newLine intent}}]`;
