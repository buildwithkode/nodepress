'use client';

import { Form, Input, InputNumber, Switch, Select, Image, Divider } from 'antd';
import dynamic from 'next/dynamic';
import RepeaterField from './RepeaterField';
import FlexibleField from './FlexibleField';

const RichTextEditor = dynamic(() => import('../../../components/RichTextEditor'), { ssr: false });

interface SubField { name: string; type: string }
interface Layout { name: string; label: string; fields: SubField[] }
interface Field {
  name: string;
  type: string;
  options?: { subFields?: SubField[]; layouts?: Layout[] };
}

interface Props {
  field: Field;
  form: any;
}

export default function DynamicFormField({ field, form }: Props) {
  const label = field.name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  // --- Repeater ---
  if (field.type === 'repeater') {
    const subFields = field.options?.subFields?.filter((f) => f.name) || [];
    return (
      <div style={{ marginBottom: 24 }}>
        <Divider orientation="left" plain style={{ fontSize: 13 }}>
          {label} <span style={{ color: '#ff6b35', fontSize: 11 }}>(repeater)</span>
        </Divider>
        <RepeaterField fieldName={field.name} subFields={subFields} />
      </div>
    );
  }

  // --- Flexible Content ---
  if (field.type === 'flexible') {
    const layouts = field.options?.layouts?.filter((l) => l.name) || [];
    return (
      <div style={{ marginBottom: 24 }}>
        <Divider orientation="left" plain style={{ fontSize: 13 }}>
          {label} <span style={{ color: '#eb2f96', fontSize: 11 }}>(flexible)</span>
        </Divider>
        <FlexibleField fieldName={field.name} layouts={layouts} form={form} />
      </div>
    );
  }

  // --- Standard fields ---
  const renderInput = () => {
    switch (field.type) {
      case 'text':
        return <Input placeholder={`Enter ${label}`} />;

      case 'textarea':
        return <Input.TextArea rows={3} placeholder={`Enter ${label}`} />;

      case 'richtext':
        return <RichTextEditor placeholder={`Enter ${label}`} />;

      case 'number':
        return <InputNumber style={{ width: '100%' }} placeholder={`Enter ${label}`} />;

      case 'boolean':
        return <Switch />;

      case 'select':
        return (
          <Select
            placeholder={`Select ${label}`}
            options={(field.options as any)?.map?.((o: string) => ({ label: o, value: o })) || []}
          />
        );

      case 'image':
        return (
          <Form.Item noStyle shouldUpdate={(prev, cur) => prev[field.name] !== cur[field.name]}>
            {({ getFieldValue }) => {
              const url = getFieldValue(field.name);
              return (
                <>
                  <Input placeholder="Paste image URL from Media Library" />
                  {url && (
                    <div style={{ marginTop: 8 }}>
                      <Image
                        src={url}
                        alt="preview"
                        height={80}
                        style={{ borderRadius: 4, objectFit: 'cover' }}
                      />
                    </div>
                  )}
                </>
              );
            }}
          </Form.Item>
        );

      default:
        return <Input placeholder={`Enter ${label}`} />;
    }
  };

  return (
    <Form.Item
      label={label}
      name={field.name}
      valuePropName={field.type === 'boolean' ? 'checked' : 'value'}
    >
      {renderInput()}
    </Form.Item>
  );
}
