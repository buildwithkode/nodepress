'use client';

import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

interface SubField {
  name: string;
  type: string;
}

interface Props {
  fieldName: string;
  subFields: SubField[];
  register: any;
  errors: any;
}

function toLabel(name: string) {
  return name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function renderSubInput(type: string, path: string, register: any, sf: SubField) {
  const fieldPath = `${path}.${sf.name}`;
  switch (type) {
    case 'textarea':
      return <Textarea rows={2} placeholder={sf.name.replace(/_/g, ' ')} {...register(fieldPath)} />;
    case 'number':
      return <Input type="number" placeholder={sf.name.replace(/_/g, ' ')} {...register(fieldPath, { valueAsNumber: true })} />;
    case 'boolean':
      return <input type="checkbox" className="h-4 w-4 rounded border-gray-300" {...register(fieldPath)} />;
    default:
      return <Input type="text" placeholder={sf.name.replace(/_/g, ' ')} {...register(fieldPath)} />;
  }
}

export default function GroupField({ fieldName, subFields, register, errors }: Props) {
  return (
    <div className="rounded-md border border-violet-400/40 border-l-4 border-l-violet-400 bg-muted/30 p-3 space-y-3">
      {subFields.map((sf) => {
        const sfLabel = toLabel(sf.name);
        return (
          <div key={sf.name}>
            {sf.type === 'boolean' ? (
              <div className="flex items-center gap-2">
                {renderSubInput(sf.type, fieldName, register, sf)}
                <Label className="text-sm">{sfLabel}</Label>
              </div>
            ) : (
              <>
                <Label className="mb-1 block text-sm">{sfLabel}</Label>
                {renderSubInput(sf.type, fieldName, register, sf)}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
