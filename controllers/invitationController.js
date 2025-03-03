const { v4: uuidv4 } = require("uuid");
const logger = require("../utils/logger");
const {
  BadRequestError,
  NotFoundError,
  ForbiddenError,
} = require("../middlewares/error");
const { executeQuery, beginTransaction } = require("../config/database");

/**
 * Tạo lời mời vào workspace
 */
const createInvitation = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { email, role } = req.body;
    const userId = req.user.id;

    // Kiểm tra quyền quản trị workspace
    const adminCheckQuery = `
        SELECT * FROM workspace_members wm
        JOIN roles r ON wm.role_id = r.id
        WHERE wm.workspace_id = ? AND wm.user_id = ? AND r.name IN ('OWNER', 'ADMIN')
      `;

    if (role.toUpperCase() === "ADMIN" && adminCheck[0].role_name !== "OWNER") {
      return next(
        new ForbiddenError("Chỉ người sở hữu mới có thể mời người quản trị")
      );
    }

    const adminCheck = await executeQuery(adminCheckQuery, [id, userId]);

    if (adminCheck.length === 0) {
      return next(
        new ForbiddenError(
          "Bạn không có quyền mời thành viên vào workspace này"
        )
      );
    }

    // Kiểm tra email có tồn tại trong hệ thống
    const userQuery = `SELECT id FROM users WHERE email = ?`;
    const users = await executeQuery(userQuery, [email]);

    if (users.length === 0) {
      return next(new BadRequestError("Người dùng không tồn tại"));
    }

    const invitedUserId = users[0].id;

    // Kiểm tra người dùng đã là thành viên của workspace chưa
    const existingMemberQuery = `
        SELECT * FROM workspace_members
        WHERE workspace_id = ? AND user_id = ?
      `;

    const existingMember = await executeQuery(existingMemberQuery, [
      id,
      invitedUserId,
    ]);

    if (existingMember.length > 0) {
      return next(
        new BadRequestError("Người dùng đã là thành viên của workspace")
      );
    }

    // Kiểm tra đã có lời mời chưa xử lý cho người dùng trong workspace này
    const existingInvitationQuery = `
        SELECT * FROM workspace_invitations
        WHERE workspace_id = ? AND user_id = ? AND status = 'PENDING'
      `;

    const existingInvitation = await executeQuery(existingInvitationQuery, [
      id,
      invitedUserId,
    ]);

    if (existingInvitation.length > 0) {
      return next(
        new BadRequestError("Đã có lời mời đang chờ xử lý cho người dùng này")
      );
    }

    // Chỉ OWNER mới có thể mời ADMIN
    if (role.toUpperCase() === "ADMIN" && adminCheck[0].role_name !== "OWNER") {
      return next(
        new ForbiddenError("Chỉ người sở hữu mới có thể mời người quản trị")
      );
    }

    // Lấy role_id từ tên role
    const roleQuery = `SELECT id FROM roles WHERE name = ?`;
    const roles = await executeQuery(roleQuery, [role.toUpperCase()]);

    if (roles.length === 0) {
      return next(new BadRequestError("Vai trò không hợp lệ"));
    }

    const roleId = roles[0].id;

    // Tạo lời mời
    const invitationId = uuidv4();
    const createInvitationQuery = `
    INSERT INTO workspace_invitations (id, workspace_id, user_id, role_id, inviter_id)
    VALUES (?, ?, ?, ?, ?)
  `;

    await executeQuery(createInvitationQuery, [
      invitationId,
      id,
      newMemberId,
      roleId,
      userId, // Thêm người mời vào đây
    ]);

    // TODO: Gửi email thông báo lời mời

    res.status(201).json({
      success: true,
      message: "Đã gửi lời mời cho thành viên mới",
      data: {
        id: invitationId,
        workspaceId: id,
        userId: invitedUserId,
        role: role.toUpperCase(),
        status: "PENDING",
      },
    });
  } catch (error) {
    logger.error("Error creating invitation:", error);
    next(error);
  }
};

/**
 * Lấy danh sách lời mời của người dùng
 */
const getUserInvitations = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Lấy danh sách lời mời đang chờ xử lý
    const invitationsQuery = `
        SELECT inviter_id, i.id, i.workspace_id, w.name as workspace_name, i.role_id, 
        r.name as role, i.created_at, i.status,
        u.full_name as inviter_name, u.email as inviter_email
        FROM workspace_invitations i
        JOIN workspaces w ON i.workspace_id = w.id
        JOIN roles r ON i.role_id = r.id
        JOIN users u ON i.inviter_id = u.id
        WHERE i.user_id = ? AND i.status = 'PENDING'
        ORDER BY i.created_at DESC
      `;

    const invitations = await executeQuery(invitationsQuery, [userId]);

    res.status(200).json({
      success: true,
      count: invitations.length,
      data: invitations,
    });
  } catch (error) {
    logger.error("Error fetching user invitations:", error);
    next(error);
  }
};

/**
 * Chấp nhận lời mời vào workspace
 */
const acceptInvitation = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    console.log("Invitation ID:", id);
    console.log("User ID:", userId);

    if (!id || !userId) {
      return res.status(400).json({
        success: false,
        message: "Thiếu invitationId hoặc userId",
      });
    }

    // Kiểm tra xem lời mời có tồn tại không
    const invitationQuery = `
          SELECT * FROM workspace_invitations 
          WHERE id = ? AND user_id = ? AND status = 'PENDING'
        `;

    const invitations = await executeQuery(invitationQuery, [id, userId]);

    if (invitations.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Lời mời không tồn tại hoặc đã xử lý",
      });
    }

    const invitation = invitations[0];

    // Transaction để thêm thành viên và cập nhật trạng thái lời mời
    const transaction = await beginTransaction();

    try {
      // Thêm người dùng vào workspace
      const addMemberQuery = `
            INSERT INTO workspace_members (workspace_id, user_id, role_id)
            VALUES (?, ?, ?)
          `;

      await transaction.execute(addMemberQuery, [
        invitation.workspace_id,
        userId,
        invitation.role_id,
      ]);

      // Cập nhật trạng thái lời mời
      const updateInvitationQuery = `
            UPDATE workspace_invitations
            SET status = 'ACCEPTED'
            WHERE id = ?
          `;

      await transaction.execute(updateInvitationQuery, [id]);

      await transaction.commit();

      res.status(200).json({
        success: true,
        message: "Đã chấp nhận lời mời tham gia workspace",
      });
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error("Error accepting invitation:", error);
    res.status(500).json({
      success: false,
      message: "Đã xảy ra lỗi khi xử lý lời mời",
      error: error.message,
    });
  }
};

/**
 * Từ chối lời mời vào workspace
 */
const declineInvitation = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Kiểm tra lời mời có tồn tại và thuộc về người dùng
    const invitationQuery = `
        SELECT * FROM workspace_invitations
        WHERE id = ? AND user_id = ? AND status = 'PENDING'
      `;

    const invitations = await executeQuery(invitationQuery, [id, userId]);

    if (invitations.length === 0) {
      return next(
        new NotFoundError("Lời mời không tồn tại hoặc đã được xử lý")
      );
    }

    // Cập nhật trạng thái lời mời
    const updateInvitationQuery = `
        UPDATE workspace_invitations
        SET status = 'DECLINED'
        WHERE id = ?
      `;

    await executeQuery(updateInvitationQuery, [id]);

    res.status(200).json({
      success: true,
      message: "Đã từ chối lời mời tham gia workspace",
    });
  } catch (error) {
    logger.error("Error declining invitation:", error);
    next(error);
  }
};

/**
 * Hủy lời mời vào workspace
 */
const cancelInvitation = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Lấy thông tin lời mời
    const invitationQuery = `
        SELECT i.*, w.owner_id
        FROM workspace_invitations i
        JOIN workspaces w ON i.workspace_id = w.id
        WHERE i.id = ? AND i.status = 'PENDING'
      `;

    const invitations = await executeQuery(invitationQuery, [id]);

    if (invitations.length === 0) {
      return next(
        new NotFoundError("Lời mời không tồn tại hoặc đã được xử lý")
      );
    }

    const invitation = invitations[0];

    // Kiểm tra quyền quản lý workspace
    if (invitation.inviter_id !== userId && invitation.owner_id !== userId) {
      const adminCheckQuery = `
          SELECT * FROM workspace_members wm
          JOIN roles r ON wm.role_id = r.id
          WHERE wm.workspace_id = ? AND wm.user_id = ? AND r.name IN ('OWNER', 'ADMIN')
        `;

      const adminCheck = await executeQuery(adminCheckQuery, [
        invitation.workspace_id,
        userId,
      ]);

      if (adminCheck.length === 0) {
        return next(new ForbiddenError("Bạn không có quyền hủy lời mời này"));
      }
    }

    // Xóa lời mời
    const deleteInvitationQuery = `
        DELETE FROM workspace_invitations
        WHERE id = ?
      `;

    await executeQuery(deleteInvitationQuery, [id]);

    res.status(200).json({
      success: true,
      message: "Đã hủy lời mời tham gia workspace",
    });
  } catch (error) {
    logger.error("Error canceling invitation:", error);
    next(error);
  }
};

module.exports = {
  createInvitation,
  getUserInvitations,
  acceptInvitation,
  declineInvitation,
  cancelInvitation,
};
