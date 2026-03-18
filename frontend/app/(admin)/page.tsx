'use client';

import { Card, Row, Col, Statistic, Typography } from 'antd';
import {
  AppstoreOutlined,
  FileOutlined,
  PictureOutlined,
} from '@ant-design/icons';
import { useEffect, useState } from 'react';
import api from '../../lib/axios';

const { Title } = Typography;

export default function DashboardPage() {
  const [stats, setStats] = useState({ contentTypes: 0, entries: 0, media: 0 });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [ctRes, entriesRes, mediaRes] = await Promise.all([
          api.get('/content-types'),
          api.get('/entries'),
          api.get('/media'),
        ]);
        setStats({
          contentTypes: ctRes.data.length,
          entries: entriesRes.data.length,
          media: mediaRes.data.length,
        });
      } catch (_) {}
    };
    fetchStats();
  }, []);

  return (
    <div>
      <Title level={4} style={{ marginBottom: 24 }}>
        Dashboard
      </Title>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="Content Types"
              value={stats.contentTypes}
              prefix={<AppstoreOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="Total Entries"
              value={stats.entries}
              prefix={<FileOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="Media Files"
              value={stats.media}
              prefix={<PictureOutlined />}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
