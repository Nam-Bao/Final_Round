import React from 'react';
import { Form, Input, InputNumber, Select, Button, Space, Divider } from 'antd';
import { PlusOutlined, MinusCircleOutlined } from '@ant-design/icons';

const TITLES = ['BS', 'BSCKI', 'BSCKII', 'ThS.BS', 'TS.BS', 'PGS.TS.BS', 'GS.TS.BS'];
// Chuyên gia tư vấn có thể không phải bác sĩ (cử nhân dinh dưỡng, dược sĩ mỹ phẩm...)
const EXPERT_TITLES = [...TITLES, 'CN', 'ThS', 'TS', 'DS', 'ThS.DS'];

export const CONSULT_FIELD_OPTIONS = [
  { value: 'DERMATOLOGY', label: 'Da liễu' },
  { value: 'NUTRITION', label: 'Dinh dưỡng' },
  { value: 'COSMETICS', label: 'Mỹ phẩm' },
];

// Phần hồ sơ công khai của bác sĩ / chuyên gia trong Hồ sơ nhân sự
// (hiển thị cho khách ở trang Đội ngũ bác sĩ, Đặt lịch khám, Đặt lịch tư vấn)
export default function ProfessionalFields({ isExpert }) {
  return (
    <>
      <p className="text-gray-500 text-sm">Phần này hiển thị công khai cho khách. Chỉ nhập sau khi đã đối chiếu bằng cấp và chứng chỉ hành nghề bản gốc.</p>
      {isExpert && (
        <Space className="w-full bg-purple-50 border border-purple-200 rounded-lg px-3 pt-3 mb-4" align="start" wrap>
          <Form.Item label="Lĩnh vực tư vấn" name={['professional', 'consult_field']} style={{ width: 200 }} rules={[{ required: true, message: 'Chọn lĩnh vực' }]}>
            <Select options={CONSULT_FIELD_OPTIONS} placeholder="Chọn lĩnh vực" />
          </Form.Item>
          <Form.Item
            label="Thù lao mỗi lượt tư vấn hoàn thành (nội bộ)"
            name={['professional', 'session_fee']}
            style={{ width: 260 }}
            tooltip="Dùng để tính tiền trả chuyên gia cuối tháng. Không hiển thị cho khách."
            rules={[{ required: true, message: 'Nhập thù lao' }]}
          >
            <InputNumber min={0} max={10000000} step={50000} className="w-full" addonAfter="đ"
              formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')} parser={(v) => v.replace(/\./g, '')} />
          </Form.Item>
        </Space>
      )}
      <Space className="w-full" align="start" wrap>
        <Form.Item label="Học hàm / học vị" name={['professional', 'title']} style={{ width: 160 }}>
          <Select allowClear placeholder="Chọn" options={(isExpert ? EXPERT_TITLES : TITLES).map((t) => ({ value: t, label: t }))} />
        </Form.Item>
        <Form.Item label={isExpert ? 'Chuyên môn' : 'Chuyên khoa'} name={['professional', 'specialty']} style={{ width: 260 }} rules={[{ required: true, message: 'Nhập chuyên môn' }]}>
          <Input maxLength={150} />
        </Form.Item>
        <Form.Item label="Số năm kinh nghiệm" name={['professional', 'experience_years']} style={{ width: 160 }}>
          <InputNumber min={0} max={60} className="w-full" />
        </Form.Item>
      </Space>
      <Space className="w-full" align="start" wrap>
        <Form.Item label="Nơi công tác" name={['professional', 'workplace']} style={{ width: 420 }}>
          <Input maxLength={200} placeholder="VD: Phòng khám Da liễu GlowSkin" />
        </Form.Item>
        <Form.Item label="Số chứng chỉ hành nghề" name={['professional', 'license_number']} style={{ width: 200 }}>
          <Input maxLength={50} />
        </Form.Item>
      </Space>
      <Form.Item label="Giới thiệu ngắn" name={['professional', 'bio']}>
        <Input.TextArea rows={3} maxLength={2000} showCount />
      </Form.Item>

      <Divider titlePlacement="start" plain>Quá trình đào tạo</Divider>
      <Form.List name={['professional', 'education']}>
        {(fields, { add, remove }) => (
          <>
            {fields.map(({ key, name }) => (
              <Space key={key} align="baseline" className="w-full" wrap>
                <Form.Item name={[name, 'degree']} rules={[{ required: true, message: 'Nhập bằng cấp' }]} style={{ width: 220 }}>
                  <Input placeholder="Bằng cấp (VD: Bác sĩ Đa khoa)" maxLength={150} />
                </Form.Item>
                <Form.Item name={[name, 'school']} rules={[{ required: true, message: 'Nhập nơi đào tạo' }]} style={{ width: 300 }}>
                  <Input placeholder="Nơi đào tạo" maxLength={200} />
                </Form.Item>
                <Form.Item name={[name, 'year']} style={{ width: 100 }}>
                  <InputNumber placeholder="Năm" min={1950} max={new Date().getFullYear()} className="w-full" />
                </Form.Item>
                <MinusCircleOutlined onClick={() => remove(name)} className="text-red-500" />
              </Space>
            ))}
            <Button type="dashed" onClick={() => add()} icon={<PlusOutlined />} block>Thêm bằng cấp</Button>
          </>
        )}
      </Form.List>

      <Divider titlePlacement="start" plain>Kinh nghiệm công tác</Divider>
      <Form.List name={['professional', 'work_history']}>
        {(fields, { add, remove }) => (
          <>
            {fields.map(({ key, name }) => (
              <Space key={key} align="baseline" className="w-full" wrap>
                <Form.Item name={[name, 'position']} rules={[{ required: true, message: 'Nhập chức vụ' }]} style={{ width: 200 }}>
                  <Input placeholder="Chức vụ (VD: Bác sĩ điều trị)" maxLength={150} />
                </Form.Item>
                <Form.Item name={[name, 'place']} rules={[{ required: true, message: 'Nhập nơi công tác' }]} style={{ width: 260 }}>
                  <Input placeholder="Nơi công tác" maxLength={200} />
                </Form.Item>
                <Form.Item name={[name, 'from']} rules={[{ required: true, message: 'Năm bắt đầu' }]} style={{ width: 90 }}>
                  <InputNumber placeholder="Từ năm" min={1950} max={new Date().getFullYear()} className="w-full" />
                </Form.Item>
                <Form.Item name={[name, 'to']} style={{ width: 90 }} tooltip="Để trống nếu đang làm">
                  <InputNumber placeholder="Đến (trống = nay)" min={1950} max={new Date().getFullYear()} className="w-full" />
                </Form.Item>
                <MinusCircleOutlined onClick={() => remove(name)} className="text-red-500" />
              </Space>
            ))}
            <Button type="dashed" onClick={() => add()} icon={<PlusOutlined />} block>Thêm nơi công tác</Button>
          </>
        )}
      </Form.List>

      <Divider titlePlacement="start" plain>Chứng chỉ & thế mạnh</Divider>
      <Form.Item label="Chứng chỉ chuyên môn" name={['professional', 'certificates']} tooltip="Gõ rồi nhấn Enter để thêm từng chứng chỉ">
        <Select mode="tags" tokenSeparators={['\n']} placeholder="VD: Chứng chỉ Laser trong Da liễu thẩm mỹ - 2020" open={false} />
      </Form.Item>
      <Form.Item label={isExpert ? 'Thế mạnh tư vấn' : 'Thế mạnh điều trị'} name={['professional', 'expertise']} tooltip="Gõ rồi nhấn Enter để thêm">
        <Select mode="tags" placeholder="VD: Mụn trứng cá, Nám da..." open={false} />
      </Form.Item>

    </>
  );
}
