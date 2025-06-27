import { resolve } from 'path';
import { writeFileSync } from 'fs';
import * as TJS from 'typescript-json-schema';

// optionally pass argument to schema generator
const settings: TJS.PartialArgs = {
  required: true,
  ref: false,
};

const program = TJS.getProgramFromFiles([resolve('src/grammar/constants/markersRegistry.ts')], {
  strictNullChecks: true,
});

// Generate the schema for our marker map type
const schema = TJS.generateSchema(program, 'Record<string, USFMMarkerInfo>', settings);

if (schema) {
  writeFileSync('src/grammar/constants/markers.schema.json', JSON.stringify(schema, null, 2));
}
