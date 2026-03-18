'use client';

import { Form, Input, InputNumber, Switch, Select, Button, Card, Space, Tag } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { useWatch } from 'antd/es/form/Form';

interface SubField { name: string; type: string }
interface Layout { name: string; label: string; fields: SubField[] }

interface Props {
  fieldName: string;
  layouts: Layout[];
  form: any;
}

const renderSubInput = (type: string) => {
  switch (type) {
    case 'number': return <InputNumber style={{ width: '100%' }} />;
    case 'boolean': return <Switch />;
    case 'textarea': return <Input.TextArea rows={2} />;
    case 'richtext': return <Input.TextArea rows={4} />;
    case 'image': return <Input placeholder="Image URL" />;
    default: return <Input />;
  }
};

// Renders a single flexible section's fields based on selected layout
const FlexibleItem = ({
  listField,
  layouts,
  form,
  fieldName,
  onRemove,
  index,
}: {
  listField: any;
  layouts: Layout[];
  form: any;
  fieldName: string;
  onRemove: () => void;
  index: number;
}) => {
  const selectedLayout = useWatch([fieldName, listField.name, '_layout'], form);
  const layout = layouts.find((l) => l.name === selectedLayout);

  return (
    <Card
      size="small"
      style={{ background: '#fafafa', borderLeft: '3px solid #eb2f96' }}
      title={
        <Space>
          <Tag color="magenta">{index + 1}</Tag>
          {layout?.label || 'Select a layout'}
        </Space>
      }
      extra={
        <Button icon={<DeleteOutlined />} size="small" type="text" danger onClick={onRemove} />
      }
    >
      {/* Layout selector */}
      <Form.Item
        name={[listField.name, '_layout']}
        label="Section Type"
        rules={[{ required: true, message: 'Select a layout' }]}
        style={{ marginBottom: 12 }}
      >
        <Select
          placeholder="Choose section layout"
          options={layouts.map((l) => ({ label: l.label || l.name, value: l.name }))}
        />
      </Form.Item>

      {/* Render layout's fields */}
      {layout &&
        layout.fields
          .filter((f) => f.name)
          .map((f) => (
            <Form.Item
              key={f.name}
              label={f.name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
              name={[listField.name, f.name]}
              valuePropName={f.type === 'boolean' ? 'checked' : 'value'}
              style={{ marginBottom: 8 }}
            >
              {renderSubInput(f.type)}
            </Form.Item>
          ))}
    </Card>
  );
};

export default function FlexibleField({ fieldName, layouts, form }: Props) {
  return (
    <Form.List name={fieldName}>
      {(listFields, { add, remove }) => (
        <div>
          <Space direction="vertical" style={{ width: '100%' }} size={8}>
            {listFields.map((listField, index) => (
              <FlexibleItem
                key={listField.key}
                listField={listField}
                layouts={layouts}
                form={form}
                fieldName={fieldName}
                index={index}
                onRemove={() => remove(listField.name)}
              />
            ))}
          </Space>

          <Select
            placeholder="+ Add Section"
            style={{ width: '100%', marginTop: listFields.length > 0 ? 8 : 0 }}
            value={null}
            options={layouts.map((l) => ({ label: `+ ${l.label || l.name}`, value: l.name }))}
            onChange={(layoutName) => add({ _layout: layoutName })}
          />
        </div>
      )}
    </Form.List>
  );
}
