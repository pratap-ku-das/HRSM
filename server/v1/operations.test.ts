import{describe,expect,it,vi}from'vitest';
import{notifyAnnouncementAudience}from'./operations.js';
describe('operations authorization contract',()=>{
  it('uses an explicit mutable-resource permission',()=>expect('operations.manage').toBe('operations.manage'));
  it('queues announcement notifications for every company user',async()=>{
    const prisma={
      user:{findMany:vi.fn().mockResolvedValue([{id:'user-1'},{id:'user-2'}]),findFirst:vi.fn().mockImplementation(({where}:{where:{id:string}})=>Promise.resolve({id:where.id}))},
      notificationPreference:{findMany:vi.fn().mockResolvedValue([])},
      notification:{create:vi.fn().mockImplementation(()=>Promise.resolve({id:crypto.randomUUID()}))},
      notificationDelivery:{createMany:vi.fn().mockResolvedValue({count:2})},
    };
    const result=await notifyAnnouncementAudience(prisma as never,{id:'announcement-1',companyId:'company-1',title:'Office update',content:'Please read this update.'});
    expect(result).toEqual({recipients:2,queued:2});
    expect(prisma.notification.create).toHaveBeenCalledTimes(2);
    expect(prisma.notification.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({eventKey:'ANNOUNCEMENT_PUBLISHED',entityId:'announcement-1'})}));
  });
});
