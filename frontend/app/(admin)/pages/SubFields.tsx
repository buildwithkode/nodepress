'use client';

import { withCondition } from '@/components/ConditionalField';
import { FIELD_GRID, fieldCell } from '@/components/FieldWidth';
import type { FieldCondition } from '@/lib/field-condition';
import DynamicFormField from './DynamicFormField';

export interface SubField {
  name: string;
  type: string;
  label?: string;
  required?: boolean;
  width?: string;
  options?: any;
  condition?: FieldCondition;
}

interface Props {
  /** Form path of the object holding these fields: `seo`, `links.0`, `blocks.2.buttons.1` */
  path: string;
  fields: SubField[];
  control: any;
  register: any;
  errors: any;
  watch?: any;
}

/**
 * The fields of a group, a repeater row or a flexible block, rendered like
 * top-level fields — so repeaters, groups and flexible fields nest, and every
 * field type works at every level.
 */
export function SubFields({ path, fields, control, register, errors, watch }: Props) {
  const named = fields.filter((f) => f.name);
  return (
    <div className={FIELD_GRID}>
      {named.map((sf) => (
        <div key={sf.name} className={fieldCell(sf.width)}>
          {withCondition(sf, { control, fields: named, path }, (
            <DynamicFormField
              key={sf.name}
              field={sf}
              name={`${path}.${sf.name}`}
              control={control}
              register={register}
              errors={errors}
              watch={watch}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
