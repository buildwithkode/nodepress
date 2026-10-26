'use client';

import { SubFields, type SubField } from './SubFields';

interface Props {
  fieldName: string;
  subFields: SubField[];
  register: any;
  control: any;
  errors: any;
  watch?: any;
}

export default function GroupField({ fieldName, subFields, register, control, errors, watch }: Props) {
  return (
    <div className="rounded-md border border-violet-400/40 border-l-4 border-l-violet-400 bg-muted/30 p-3 pb-0">
      <SubFields path={fieldName} fields={subFields} control={control} register={register} errors={errors} watch={watch} />
    </div>
  );
}
