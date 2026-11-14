import { BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { isValidObjectId } from 'mongoose';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.type.js';
import { CreateManagedUserDto, UpdateManagedUserDto } from './manage-user.dto.js';
import { UsersService } from './users.service.js';
import { ChangeOwnPasswordDto, UpdateOwnPreferencesDto, UpdateSelfProfileDto } from './self-service.dto.js';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Patch('me/profile')
  async updateProfile(@CurrentUser() actor: JwtPayload, @Body() dto: UpdateSelfProfileDto) {
    const user = await this.users.updateSelf(actor.sub, { name: dto.name.trim(), jobTitle: dto.jobTitle.trim(), avatarUrl: dto.avatarUrl.trim() });
    if (!user) throw new NotFoundException();
    return user.toJSON();
  }

  @Patch('me/preferences')
  async updatePreferences(@CurrentUser() actor: JwtPayload, @Body() dto: UpdateOwnPreferencesDto) {
    const user = await this.users.updateSelf(actor.sub, {
      ...(dto.soundEnabled !== undefined ? { soundEnabled: dto.soundEnabled } : {}),
      ...(dto.cannedResponses !== undefined ? { cannedResponses: dto.cannedResponses.map((text) => text.trim()) } : {}),
    });
    if (!user) throw new NotFoundException();
    return user.toJSON();
  }

  @Post('me/password')
  async changePassword(@CurrentUser() actor: JwtPayload, @Body() dto: ChangeOwnPasswordDto) {
    const current = await this.users.findById(actor.sub);
    if (!current) throw new ForbiddenException();
    const user = await this.users.findByEmailWithPassword(current.email);
    if (!user || !(await bcrypt.compare(dto.currentPassword, user.passwordHash))) {
      throw new BadRequestException('Mật khẩu hiện tại không đúng.');
    }
    if (Buffer.byteLength(dto.newPassword, 'utf8') > 72) throw new BadRequestException('Mật khẩu tối đa 72 byte UTF-8.');
    if (dto.currentPassword === dto.newPassword) throw new BadRequestException('Mật khẩu mới phải khác mật khẩu hiện tại.');
    const updated = await this.users.changeOwnPassword(actor.sub, user.passwordHash, await bcrypt.hash(dto.newPassword, 10));
    if (!updated) throw new ConflictException('Mật khẩu vừa thay đổi. Hãy đăng nhập lại.');
    return { ok: true, requiresLogin: true };
  }

  private async assertAdmin(actor: JwtPayload) {
    // Read the current database role, not a potentially stale JWT claim.
    const current = await this.users.findById(actor.sub);
    if (!current || current.role !== 'admin' || !current.emailVerified) {
      throw new ForbiddenException('Chỉ quản trị viên được quản lý người dùng.');
    }
  }

  @Get()
  async list(@CurrentUser() actor: JwtPayload) {
    await this.assertAdmin(actor);
    return (await this.users.listManaged()).map((user) => user.toJSON());
  }

  @Post()
  async create(@CurrentUser() actor: JwtPayload, @Body() dto: CreateManagedUserDto) {
    await this.assertAdmin(actor);
    if (!dto.name.trim()) throw new BadRequestException('Tên không được để trống.');
    try {
      const user = await this.users.createManaged({
        email: dto.email.trim().toLowerCase(), name: dto.name.trim(), role: dto.role,
        passwordHash: await bcrypt.hash(dto.password, 10),
        jobTitle: dto.jobTitle?.trim() ?? '', avatarUrl: dto.avatarUrl?.trim() ?? '',
      });
      return user.toJSON();
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
        throw new ConflictException('Email đã được sử dụng.');
      }
      throw error;
    }
  }

  @Delete(':id')
  async remove(@CurrentUser() actor: JwtPayload, @Param('id') id: string) {
    await this.assertAdmin(actor);
    if (!isValidObjectId(id)) throw new BadRequestException('ID không hợp lệ.');
    if (id.toLowerCase() === actor.sub.toLowerCase()) {
      throw new BadRequestException('Bạn không thể tự xóa tài khoản đang đăng nhập.');
    }
    if (!(await this.users.deleteManaged(id))) throw new NotFoundException('Không tìm thấy người dùng.');
    return { ok: true };
  }

  @Patch(':id')
  async update(@CurrentUser() actor: JwtPayload, @Param('id') id: string, @Body() dto: UpdateManagedUserDto) {
    await this.assertAdmin(actor);
    if (!isValidObjectId(id)) throw new BadRequestException('ID không hợp lệ.');
    if (!dto.name.trim()) throw new BadRequestException('Tên không được để trống.');
    if (id === actor.sub && dto.role !== 'admin') {
      throw new BadRequestException('Bạn không thể tự hạ quyền quản trị.');
    }
    const user = await this.users.updateManaged(id, {
      name: dto.name.trim(),
      role: dto.role,
      jobTitle: dto.jobTitle?.trim() ?? '',
      avatarUrl: dto.avatarUrl?.trim() ?? '',
    });
    if (!user) throw new NotFoundException('Không tìm thấy người dùng.');
    return user.toJSON();
  }
}
