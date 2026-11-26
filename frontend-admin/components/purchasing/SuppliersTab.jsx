// Nhà cung cấp: thêm / sửa / ngừng hợp tác (email dùng để gửi đơn đặt hàng)
import React, { useEffect, useState } from 'react';
import { Table, Tag, Button, Modal, Form, Input, Switch, message } from 'antd';
import { PlusOutlined, EditOutlined } from '@ant-design/icons';
import axios from 'axios';
import { API, auth, errMsg } from './common';

export default function SuppliersTab() {
  const [rows, setRows] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();
  const load = () => axios.get(`${API}/purchasing/suppliers`, { ...auth(), params: { all: 1 } }).then((r) => setRows(r.data.data || [])).catch(() => message.error('Không tải được nhà cung cấp'));
  useEffect(() => { load(); }, []);
  const open = (row) => { setEditing(row || {}); form.setFieldsValue(row ? { ...row } : { is_active: true }); };
  const save = async () => {
    const values = await form.validateFields();
    try {
      if (editing.id) await axios.put(`${API}/purchasing/suppliers/${editing.id}`, values, auth());
      else await axios.post(`${API}/purchasing/suppliers`, values, auth());
      message.success('Đã lưu nhà cung cấp'); setEditing(null); load();
    } catch (e) { message.error(errMsg(e, 'Không lưu được')); }
  };
  return (
    <>
      <div className="flex justify-end mb-3"><Button type="primary" icon={<PlusOutlined />} onClick={() => open(null)}>Thêm nhà cung cấp</Button></div>
      <Table rowKey="id" dataSource={rows} size="middle" pagination={{ pageSize: 10 }}
        columns={[
          { title: 'Nhà cung cấp', dataIndex: 'name', render: (v, r) => <div><b>{v}</b>{r.tax_code && <div className="text-xs text-gray-500">MST {r.tax_code}</div>}</div> },
          { title: 'Liên hệ', render: (_, r) => <div>{r.contact_name}<div className="text-xs text-gray-500">{r.phone} • {r.email}</div></div> },
          { title: 'Địa chỉ', dataIndex: 'address' },
          { title: 'Trạng thái', dataIndex: 'is_active', width: 130, render: (v) => (v ? <Tag color="green">Đang hợp tác</Tag> : <Tag>Ngừng</Tag>) },
          { title: '', width: 90, render: (_, r) => <Button size="small" icon={<EditOutlined />} onClick={() => open(r)}>Sửa</Button> },
        ]} />
      <Modal open={!!editing} title={editing?.id ? 'Sửa nhà cung cấp' : 'Thêm nhà cung cấp'} onCancel={() => setEditing(null)} onOk={save} cancelText="Đóng" okText="Lưu" destroyOnHidden>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Tên công ty" rules={[{ required: true, message: 'Nhập tên' }]}><Input maxLength={200} /></Form.Item>
          <Form.Item name="email" label="Email nhận đơn đặt hàng" rules={[{ required: true, type: 'email', message: 'Email không hợp lệ' }]}><Input maxLength={200} /></Form.Item>
          <div className="grid grid-cols-2 gap-3">
            <Form.Item name="contact_name" label="Người liên hệ"><Input maxLength={100} /></Form.Item>
            <Form.Item name="phone" label="Điện thoại"><Input maxLength={20} /></Form.Item>
          </div>
          <Form.Item name="tax_code" label="Mã số thuế"><Input maxLength={14} /></Form.Item>
          <Form.Item name="address" label="Địa chỉ"><Input maxLength={300} /></Form.Item>
          <Form.Item name="note" label="Ghi chú (mặt hàng cung cấp, điều kiện giao)"><Input.TextArea rows={2} maxLength={500} /></Form.Item>
          {editing?.id && <Form.Item name="is_active" label="Đang hợp tác" valuePropName="checked"><Switch /></Form.Item>}
        </Form>
      </Modal>
    </>
  );
}
