import { extractFields } from '@/lib/extract';
import type {
  ExtractFieldsInput,
  ExtractFieldsOptions,
  ExtractFieldsResult,
  ExtractedValue,
  LeaseFieldId,
} from '@/types';

import { SCALAR_REGEX_FIELD_IDS } from './field-sets';

function cloneFieldMap(
  fields: Partial<Record<LeaseFieldId, ExtractedValue<unknown>>>,
): Partial<Record<LeaseFieldId, ExtractedValue<unknown>>> {
  return Object.fromEntries(Object.entries(fields)) as Partial<
    Record<LeaseFieldId, ExtractedValue<unknown>>
  >;
}

export function extractScalarRegexFields(
  input: ExtractFieldsInput,
  options: Omit<ExtractFieldsOptions, 'requestedFields'>,
): ExtractFieldsResult {
  return extractFields(input, {
    ...options,
    requestedFields: [...SCALAR_REGEX_FIELD_IDS],
  });
}

export function mergeFieldMaps(
  ...maps: Array<Partial<Record<LeaseFieldId, ExtractedValue<unknown>>>>
): Partial<Record<LeaseFieldId, ExtractedValue<unknown>>> {
  return maps.reduce<Partial<Record<LeaseFieldId, ExtractedValue<unknown>>>>(
    (acc, current) => ({ ...acc, ...cloneFieldMap(current) }),
    {},
  );
}

export function buildMergedExtractionResult(
  base: ExtractFieldsResult,
  fields: Partial<Record<LeaseFieldId, ExtractedValue<unknown>>>,
  warnings: string[] = [],
): ExtractFieldsResult {
  const mergedFields = cloneFieldMap(fields);
  const missingFields = Object.entries(mergedFields)
    .filter(([, field]) => field?.status === 'missing')
    .map(([fieldId]) => fieldId as LeaseFieldId);

  return {
    ...base,
    fields: mergedFields,
    missingFields,
    warnings: [...base.warnings, ...warnings],
  };
}
