'use client';

import { Form, Input, InputNumber, Switch, Button, Card, Space } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';

interface SubField { name: string; type: string }

interface Props {
  fieldName: string;
  subFields: SubField[];
}

const renderSubInput = (type: string) => {
  switch (type) {
    case 'number': return <InputNumber style={{ width: '100%' }} />;
    case 'boolean': return <Switch />;
    case 'textarea': return <Input.TextArea rows={2} />;
    case 'image': return <Input placeholder="Image URL" />;
    default: return <Input />;
  }
};

export default function RepeaterField({ fieldName, subFields }: Props) {
  return (
    <Form.List name={fieldName}>
      {(listFields, { add, remove }) => (
        <div>
          <Space direction="vertical" style={{ width: '100%' }} size={8}>
            {listFields.map((listField, index) => (
              <Card
                key={listField.key}
                size="small"
                style={{ background: '#fafafa', borderLeft: '3px solid #ff6b35' }}
                title={<span style={{ fontSize: 12, color: '#888' }}>Item {index + 1}</span>}
                extra={
                  <Button
                    icon={<DeleteOutlined />}
                    size="small"
                    type="text"
                    danger
                    onClick={() => remove(listField.name)}
                  />
                }
              >
                {subFields.map((sf) => (
                  <Form.Item
                    key={sf.name}
                    label={sf.name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                    name={[listField.name, sf.name]}
                    valuePropName={sf.type === 'boolean' ? 'checked' : 'value'}
                    style={{ marginBottom: 8 }}
                  >
                    {renderSubInput(sf.type)}
                  </Form.Item>
                ))}
              </Card>
            ))}
          </Space>

          <Button
            type="dashed"
            icon={<PlusOutlined />}
            onClick={() => add()}
            style={{ marginTop: listFields.length > 0 ? 8 : 0, width: '100%' }}
          >
            Add Item
          </Button>
        </div>
      )}
    </Form.List>
  );
}
