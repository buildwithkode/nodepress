'use client';

import {
  Typography,
  Button,
  Table,
  Modal,
  Form,
  Input,
  Select,
  Space,
  Popconfirm,
  message,
  Tag,
  Card,
  Collapse,
  Divider,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  AppstoreOutlined,
  MinusCircleOutlined,
} from '@ant-design/icons';
import { useEffect, useState } from 'react';
import api from '../../../lib/axios';

const { Title, Text } = Typography;

const FIELD_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'textarea', label: 'Textarea' },
  { value: 'richtext', label: 'Rich Text' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'select', label: 'Select' },
  { value: 'image', label: 'Image' },
  { value: 'repeater', label: 'Repeater' },
  { value: 'flexible', label: 'Flexible Content' },
];

const SIMPLE_FIELD_TYPES = FIELD_TYPES.filter(
  (t) => t.value !== 'repeater' && t.value !== 'flexible',
);

const FIELD_TYPE_COLORS: Record<string, string> = {
  text: 'blue', textarea: 'cyan', richtext: 'geekblue',
  number: 'purple', boolean: 'orange', select: 'gold',
  image: 'green', repeater: 'volcano', flexible: 'magenta',
};

interface SubField { name: string; type: string }
interface Layout { name: string; label: string; fields: SubField[] }
interface Field {
  name: string;
  type: string;
  options?: { subFields?: SubField[]; layouts?: Layout[] };
}
interface ContentType { id: number; name: string; schema: Field[]; createdAt: string }

export default function ContentTypesPage() {
  const [contentTypes, setContentTypes] = useState<ContentType[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ContentType | null>(null);
  const [fields, setFields] = useState<Field[]>([{ name: '', type: 'text' }]);
  const [form] = Form.useForm();
  const [messageApi, contextHolder] = message.useMessage();

  const fetchContentTypes = async () => {
    setLoading(true);
    try {
      const res = await api.get('/content-types');
      setContentTypes(res.data);
    } catch { messageApi.error('Failed to load content types'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchContentTypes(); }, []);

  const openCreateModal = () => {
    setEditingItem(null);
    setFields([{ name: '', type: 'text' }]);
    form.resetFields();
    setModalOpen(true);
  };

  const openEditModal = (item: ContentType) => {
    setEditingItem(item);
    setFields(item.schema.length > 0 ? item.schema : [{ name: '', type: 'text' }]);
    form.setFieldsValue({ name: item.name });
    setModalOpen(true);
  };

  // --- Field helpers ---
  const addField = () => setFields([...fields, { name: '', type: 'text' }]);
  const removeField = (i: number) => setFields(fields.filter((_, idx) => idx !== i));
  const updateField = (i: number, key: keyof Field, val: any) => {
    const updated = [...fields];
    if (key === 'type') {
      updated[i] = { ...updated[i], type: val, options: undefined };
      if (val === 'repeater') updated[i].options = { subFields: [{ name: '', type: 'text' }] };
      if (val === 'flexible') updated[i].options = { layouts: [{ name: 'section', label: 'Section', fields: [{ name: '', type: 'text' }] }] };
    } else {
      (updated[i] as any)[key] = val;
    }
    setFields(updated);
  };

  // --- Repeater sub-field helpers ---
  const addSubField = (fi: number) => {
    const updated = [...fields];
    updated[fi].options!.subFields!.push({ name: '', type: 'text' });
    setFields(updated);
  };
  const removeSubField = (fi: number, si: number) => {
    const updated = [...fields];
    updated[fi].options!.subFields = updated[fi].options!.subFields!.filter((_, i) => i !== si);
    setFields(updated);
  };
  const updateSubField = (fi: number, si: number, key: string, val: string) => {
    const updated = [...fields];
    (updated[fi].options!.subFields![si] as any)[key] = val;
    setFields(updated);
  };

  // --- Flexible layout helpers ---
  const addLayout = (fi: number) => {
    const updated = [...fields];
    updated[fi].options!.layouts!.push({ name: '', label: '', fields: [{ name: '', type: 'text' }] });
    setFields(updated);
  };
  const removeLayout = (fi: number, li: number) => {
    const updated = [...fields];
    updated[fi].options!.layouts = updated[fi].options!.layouts!.filter((_, i) => i !== li);
    setFields(updated);
  };
  const updateLayout = (fi: number, li: number, key: string, val: string) => {
    const updated = [...fields];
    (updated[fi].options!.layouts![li] as any)[key] = val;
    setFields(updated);
  };
  const addLayoutField = (fi: number, li: number) => {
    const updated = [...fields];
    updated[fi].options!.layouts![li].fields.push({ name: '', type: 'text' });
    setFields(updated);
  };
  const removeLayoutField = (fi: number, li: number, fli: number) => {
    const updated = [...fields];
    updated[fi].options!.layouts![li].fields = updated[fi].options!.layouts![li].fields.filter((_, i) => i !== fli);
    setFields(updated);
  };
  const updateLayoutField = (fi: number, li: number, fli: number, key: string, val: string) => {
    const updated = [...fields];
    (updated[fi].options!.layouts![li].fields[fli] as any)[key] = val;
    setFields(updated);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const validFields = fields.filter((f) => f.name.trim());
      if (validFields.length === 0) { messageApi.error('Add at least one field'); return; }

      const payload = {
        name: values.name.toLowerCase().replace(/\s+/g, '_'),
        schema: validFields,
      };

      if (editingItem) {
        await api.put(`/content-types/${editingItem.id}`, payload);
        messageApi.success('Content type updated');
      } else {
        await api.post('/content-types', payload);
        messageApi.success('Content type created');
      }

      setModalOpen(false);
      fetchContentTypes();
    } catch (err: any) {
      messageApi.error(err.response?.data?.message || 'Something went wrong');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/content-types/${id}`);
      messageApi.success('Deleted');
      fetchContentTypes();
    } catch (err: any) { messageApi.error(err.response?.data?.message || 'Delete failed'); }
  };

  const columns = [
    {
      title: 'Name', dataIndex: 'name', key: 'name',
      render: (name: string) => <Space><AppstoreOutlined /><strong>{name}</strong></Space>,
    },
    {
      title: 'Fields', dataIndex: 'schema', key: 'schema',
      render: (schema: Field[]) => (
        <Space wrap>
          {schema.map((f, i) => (
            <Tag key={i} color={FIELD_TYPE_COLORS[f.type] || 'default'}>
              {f.name} <span style={{ opacity: 0.6 }}>({f.type})</span>
            </Tag>
          ))}
        </Space>
      ),
    },
    { title: 'Fields #', key: 'count', width: 90, render: (_: any, r: ContentType) => r.schema.length },
    {
      title: 'Created', dataIndex: 'createdAt', key: 'createdAt', width: 120,
      render: (d: string) => new Date(d).toLocaleDateString(),
    },
    {
      title: 'Actions', key: 'actions', width: 100,
      render: (_: any, record: ContentType) => (
        <Space>
          <Button icon={<EditOutlined />} size="small" onClick={() => openEditModal(record)} />
          <Popconfirm
            title="Delete this content type?"
            description="All entries under it will also be deleted."
            onConfirm={() => handleDelete(record.id)}
            okText="Delete" okButtonProps={{ danger: true }}
          >
            <Button icon={<DeleteOutlined />} size="small" danger />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      {contextHolder}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title level={4} style={{ margin: 0 }}>Content Types</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>Create Content Type</Button>
      </div>

      <Table dataSource={contentTypes} columns={columns} rowKey="id" loading={loading} pagination={{ pageSize: 10 }} />

      <Modal
        title={editingItem ? 'Edit Content Type' : 'Create Content Type'}
        open={modalOpen} onOk={handleSubmit} onCancel={() => setModalOpen(false)}
        okText={editingItem ? 'Update' : 'Create'} width={700} destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            label="Content Type Name" name="name"
            rules={[{ required: true, message: 'Name is required' }]}
            extra="Auto-converted to snake_case"
          >
            <Input placeholder="e.g. blog, product, page" size="large" />
          </Form.Item>
        </Form>

        <div style={{ marginTop: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <Text strong>Fields</Text>
            <Button size="small" icon={<PlusOutlined />} onClick={addField}>Add Field</Button>
          </div>

          <Space direction="vertical" style={{ width: '100%' }} size={8}>
            {fields.map((field, fi) => (
              <Card key={fi} size="small" style={{ background: '#fafafa' }} bodyStyle={{ padding: 12 }}>
                {/* Field Row */}
                <Space style={{ width: '100%' }} size={8}>
                  <Input
                    placeholder="Field name"
                    value={field.name}
                    onChange={(e) => updateField(fi, 'name', e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <Select
                    value={field.type}
                    onChange={(val) => updateField(fi, 'type', val)}
                    options={FIELD_TYPES}
                    style={{ width: 170 }}
                  />
                  <Button
                    icon={<DeleteOutlined />} size="small" danger
                    disabled={fields.length === 1}
                    onClick={() => removeField(fi)}
                  />
                </Space>

                {/* Repeater Sub-Fields */}
                {field.type === 'repeater' && field.options?.subFields && (
                  <div style={{ marginTop: 12, paddingLeft: 12, borderLeft: '3px solid #ff6b35' }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>Sub Fields</Text>
                    <Space direction="vertical" style={{ width: '100%', marginTop: 8 }} size={6}>
                      {field.options.subFields.map((sf, si) => (
                        <Space key={si} style={{ width: '100%' }} size={6}>
                          <Input
                            placeholder="sub-field name"
                            value={sf.name}
                            onChange={(e) => updateSubField(fi, si, 'name', e.target.value)}
                            size="small" style={{ flex: 1 }}
                          />
                          <Select
                            value={sf.type}
                            onChange={(val) => updateSubField(fi, si, 'type', val)}
                            options={SIMPLE_FIELD_TYPES} size="small" style={{ width: 130 }}
                          />
                          <Button
                            icon={<MinusCircleOutlined />} size="small" type="text" danger
                            disabled={field.options!.subFields!.length === 1}
                            onClick={() => removeSubField(fi, si)}
                          />
                        </Space>
                      ))}
                    </Space>
                    <Button size="small" type="dashed" icon={<PlusOutlined />} style={{ marginTop: 8 }} onClick={() => addSubField(fi)}>
                      Add Sub Field
                    </Button>
                  </div>
                )}

                {/* Flexible Layouts */}
                {field.type === 'flexible' && field.options?.layouts && (
                  <div style={{ marginTop: 12, paddingLeft: 12, borderLeft: '3px solid #eb2f96' }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>Layouts</Text>
                    <Collapse size="small" style={{ marginTop: 8 }} ghost>
                      {field.options.layouts.map((layout, li) => (
                        <Collapse.Panel
                          key={li}
                          header={
                            <Space>
                              <Input
                                placeholder="layout name (e.g. hero)"
                                value={layout.name}
                                onChange={(e) => updateLayout(fi, li, 'name', e.target.value)}
                                size="small" style={{ width: 130 }}
                                onClick={(e) => e.stopPropagation()}
                              />
                              <Input
                                placeholder="label (e.g. Hero Section)"
                                value={layout.label}
                                onChange={(e) => updateLayout(fi, li, 'label', e.target.value)}
                                size="small" style={{ width: 150 }}
                                onClick={(e) => e.stopPropagation()}
                              />
                              <Button
                                icon={<MinusCircleOutlined />} size="small" type="text" danger
                                disabled={field.options!.layouts!.length === 1}
                                onClick={(e) => { e.stopPropagation(); removeLayout(fi, li); }}
                              />
                            </Space>
                          }
                        >
                          <Space direction="vertical" style={{ width: '100%' }} size={6}>
                            {layout.fields.map((lf, fli) => (
                              <Space key={fli} style={{ width: '100%' }} size={6}>
                                <Input
                                  placeholder="field name"
                                  value={lf.name}
                                  onChange={(e) => updateLayoutField(fi, li, fli, 'name', e.target.value)}
                                  size="small" style={{ flex: 1 }}
                                />
                                <Select
                                  value={lf.type}
                                  onChange={(val) => updateLayoutField(fi, li, fli, 'type', val)}
                                  options={SIMPLE_FIELD_TYPES} size="small" style={{ width: 130 }}
                                />
                                <Button
                                  icon={<MinusCircleOutlined />} size="small" type="text" danger
                                  disabled={layout.fields.length === 1}
                                  onClick={() => removeLayoutField(fi, li, fli)}
                                />
                              </Space>
                            ))}
                          </Space>
                          <Button size="small" type="dashed" icon={<PlusOutlined />} style={{ marginTop: 8 }} onClick={() => addLayoutField(fi, li)}>
                            Add Field
                          </Button>
                        </Collapse.Panel>
                      ))}
                    </Collapse>
                    <Button size="small" type="dashed" icon={<PlusOutlined />} style={{ marginTop: 8 }} onClick={() => addLayout(fi)}>
                      Add Layout
                    </Button>
                  </div>
                )}
              </Card>
            ))}
          </Space>
        </div>
      </Modal>
    </div>
  );
}
