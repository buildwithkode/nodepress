'use client';

import {
  Typography,
  Upload,
  Image,
  Card,
  Button,
  Popconfirm,
  message,
  Row,
  Col,
  Tag,
  Tooltip,
  Empty,
  Spin,
} from 'antd';
import {
  InboxOutlined,
  DeleteOutlined,
  CopyOutlined,
  FileOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useEffect, useState } from 'react';
import Cookies from 'js-cookie';
import api from '../../../lib/axios';

const { Title, Text } = Typography;
const { Dragger } = Upload;

interface MediaFile {
  filename: string;
  url: string;
  size: number;
  createdAt: string;
}

const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'];

const isImage = (filename: string) => {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return IMAGE_EXTS.includes(ext);
};

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export default function MediaPage() {
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();

  const fetchFiles = async () => {
    setLoading(true);
    try {
      const res = await api.get('/media');
      setFiles(res.data);
    } catch {
      messageApi.error('Failed to load media files');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  const handleDelete = async (filename: string) => {
    try {
      await api.delete(`/media/${filename}`);
      messageApi.success('File deleted');
      fetchFiles();
    } catch (err: any) {
      messageApi.error(err.response?.data?.message || 'Delete failed');
    }
  };

  const handleCopyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    messageApi.success('URL copied to clipboard');
  };

  const uploadProps = {
    name: 'file',
    multiple: true,
    action: '/api/media/upload',
    headers: {
      Authorization: `Bearer ${Cookies.get('np_token') || ''}`,
    },
    accept: 'image/*,.pdf,.mp4',
    showUploadList: false,
    onChange(info: any) {
      const { status } = info.file;
      if (status === 'uploading') {
        setUploading(true);
      }
      if (status === 'done') {
        messageApi.success(`${info.file.name} uploaded`);
        setUploading(false);
        fetchFiles();
      } else if (status === 'error') {
        messageApi.error(`${info.file.name} upload failed`);
        setUploading(false);
      }
    },
  };

  return (
    <div>
      {contextHolder}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24,
        }}
      >
        <Title level={4} style={{ margin: 0 }}>
          Media Library
        </Title>
        <Button icon={<ReloadOutlined />} onClick={fetchFiles}>
          Refresh
        </Button>
      </div>

      {/* Upload Area */}
      <Dragger
        {...uploadProps}
        style={{ marginBottom: 32, borderRadius: 8 }}
        disabled={uploading}
      >
        <p className="ant-upload-drag-icon">
          {uploading ? <Spin /> : <InboxOutlined />}
        </p>
        <p className="ant-upload-text">
          {uploading ? 'Uploading...' : 'Click or drag files here to upload'}
        </p>
        <p className="ant-upload-hint">
          Supports images (JPG, PNG, GIF, WebP), PDF, MP4 — Max 10MB
        </p>
      </Dragger>

      {/* Media Grid */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 48 }}>
          <Spin size="large" />
        </div>
      ) : files.length === 0 ? (
        <Empty description="No files uploaded yet" />
      ) : (
        <>
          <Text type="secondary" style={{ marginBottom: 16, display: 'block' }}>
            {files.length} file{files.length !== 1 ? 's' : ''}
          </Text>

          <Row gutter={[16, 16]}>
            {files.map((file) => (
              <Col key={file.filename} xs={24} sm={12} md={8} lg={6} xl={4}>
                <Card
                  hoverable
                  bodyStyle={{ padding: 0 }}
                  style={{ overflow: 'hidden', borderRadius: 8 }}
                  cover={
                    isImage(file.filename) ? (
                      <Image
                        src={file.url}
                        alt={file.filename}
                        style={{
                          width: '100%',
                          height: 140,
                          objectFit: 'cover',
                          display: 'block',
                        }}
                        preview={{ src: file.url }}
                        fallback="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
                      />
                    ) : (
                      <div
                        style={{
                          height: 140,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: '#f5f5f5',
                          fontSize: 48,
                          color: '#bbb',
                        }}
                      >
                        <FileOutlined />
                      </div>
                    )
                  }
                >
                  <div style={{ padding: '10px 12px' }}>
                    {/* Filename */}
                    <Tooltip title={file.filename}>
                      <Text
                        ellipsis
                        style={{ display: 'block', fontSize: 12, marginBottom: 4 }}
                      >
                        {file.filename}
                      </Text>
                    </Tooltip>

                    {/* Size */}
                    <Tag style={{ fontSize: 11, marginBottom: 8 }}>
                      {formatSize(file.size)}
                    </Tag>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Tooltip title="Copy URL">
                        <Button
                          icon={<CopyOutlined />}
                          size="small"
                          style={{ flex: 1 }}
                          onClick={() => handleCopyUrl(file.url)}
                        >
                          Copy URL
                        </Button>
                      </Tooltip>

                      <Popconfirm
                        title="Delete this file?"
                        onConfirm={() => handleDelete(file.filename)}
                        okText="Delete"
                        okButtonProps={{ danger: true }}
                      >
                        <Button
                          icon={<DeleteOutlined />}
                          size="small"
                          danger
                        />
                      </Popconfirm>
                    </div>
                  </div>
                </Card>
              </Col>
            ))}
          </Row>
        </>
      )}
    </div>
  );
}
