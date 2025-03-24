const { v4: uuidv4 } = require("uuid");
const logger = require("../utils/logger");
const {
  BadRequestError,
  NotFoundError,
  ForbiddenError,
} = require("../middlewares/error");
const { executeQuery, beginTransaction } = require("../config/database");

/**
 * Lấy danh sách workspaces của người dùng
 */
const getWorkspaces = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // SQL query để lấy workspaces của người dùng
    const query = `
      SELECT w.* 
      FROM workspaces w
      JOIN workspace_members wm ON w.id = wm.workspace_id
      WHERE wm.user_id = ?
      ORDER BY w.updated_at DESC
    `;

    const workspaces = await executeQuery(query, [userId]);

    res.status(200).json({
      success: true,
      count: workspaces.length,
      data: workspaces,
    });
  } catch (error) {
    logger.error("Error fetching workspaces:", error);
    next(error);
  }
};

/**
 * Tạo workspace mới
 */
const createWorkspace = async (req, res, next) => {
  try {
    const { name, description } = req.body;
    const userId = req.user.id;
    const workspaceId = uuidv4();

    // Tạo workspace mới
    const createWorkspaceQuery = `
      INSERT INTO workspaces (id, name, description, owner_id)
      VALUES (?, ?, ?, ?)
    `;

    await executeQuery(createWorkspaceQuery, [
      workspaceId,
      name,
      description,
      userId,
    ]);

    // Thêm người tạo vào workspace với vai trò OWNER
    const addOwnerQuery = `
      INSERT INTO workspace_members (workspace_id, user_id, role_id)
      VALUES (?, ?, (SELECT id FROM roles WHERE name = 'OWNER'))
    `;

    await executeQuery(addOwnerQuery, [workspaceId, userId]);

    // Lấy thông tin workspace vừa tạo
    const getWorkspaceQuery = `SELECT * FROM workspaces WHERE id = ?`;
    const [workspace] = await executeQuery(getWorkspaceQuery, [workspaceId]);

    res.status(201).json({
      success: true,
      data: workspace,
    });
  } catch (error) {
    logger.error("Error creating workspace:", error);
    next(error);
  }
};

/**
 * Lấy thông tin workspace theo ID
 */
const getWorkspaceById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Kiểm tra quyền truy cập
    const memberCheckQuery = `
      SELECT * FROM workspace_members
      WHERE workspace_id = ? AND user_id = ?
    `;

    const memberCheck = await executeQuery(memberCheckQuery, [id, userId]);

    if (memberCheck.length === 0) {
      return next(
        new ForbiddenError("Bạn không có quyền truy cập workspace này")
      );
    }

    // Lấy thông tin workspace
    const workspaceQuery = `SELECT * FROM workspaces WHERE id = ?`;
    const [workspace] = await executeQuery(workspaceQuery, [id]);

    if (!workspace) {
      return next(new NotFoundError("Workspace không tồn tại"));
    }

    res.status(200).json({
      success: true,
      data: workspace,
    });
  } catch (error) {
    logger.error("Error fetching workspace:", error);
    next(error);
  }
};

/**
 * Cập nhật thông tin workspace
 */
const updateWorkspace = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;
    const userId = req.user.id;

    // Kiểm tra quyền quản trị workspace
    const adminCheckQuery = `
      SELECT * FROM workspace_members wm
      JOIN roles r ON wm.role_id = r.id
      WHERE wm.workspace_id = ? AND wm.user_id = ? AND r.name IN ('OWNER', 'ADMIN')
    `;

    const adminCheck = await executeQuery(adminCheckQuery, [id, userId]);

    if (adminCheck.length === 0) {
      return next(new ForbiddenError("Bạn không có quyền sửa workspace này"));
    }

    // Cập nhật workspace
    const updateQuery = `
      UPDATE workspaces
      SET name = ?, description = ?
      WHERE id = ?
    `;

    await executeQuery(updateQuery, [name, description, id]);

    // Lấy thông tin workspace đã cập nhật
    const getWorkspaceQuery = `SELECT * FROM workspaces WHERE id = ?`;
    const [workspace] = await executeQuery(getWorkspaceQuery, [id]);

    res.status(200).json({
      success: true,
      data: workspace,
    });
  } catch (error) {
    logger.error("Error updating workspace:", error);
    next(error);
  }
};

/**
 * Xóa workspace
 */
const deleteWorkspace = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Kiểm tra người dùng có phải là chủ sở hữu workspace
    const ownerCheckQuery = `
      SELECT * FROM workspace_members wm
      JOIN roles r ON wm.role_id = r.id
      WHERE wm.workspace_id = ? AND wm.user_id = ? AND r.name = 'OWNER'
    `;

    const ownerCheck = await executeQuery(ownerCheckQuery, [id, userId]);

    if (ownerCheck.length === 0) {
      return next(
        new ForbiddenError("Chỉ chủ sở hữu mới có thể xóa workspace")
      );
    }

    // Transaction để xóa tất cả dữ liệu liên quan đến workspace
    const transaction = await beginTransaction();

    try {
      // Xóa tất cả các trang thuộc workspace
      await transaction.execute("DELETE FROM pages WHERE workspace_id = ?", [
        id,
      ]);

      // Xóa tất cả thành viên của workspace
      await transaction.execute(
        "DELETE FROM workspace_members WHERE workspace_id = ?",
        [id]
      );

      // Xóa tất cả lời mời đến workspace
      await transaction.execute(
        "DELETE FROM workspace_invitations WHERE workspace_id = ?",
        [id]
      );

      // Xóa workspace
      await transaction.execute("DELETE FROM workspaces WHERE id = ?", [id]);

      await transaction.commit();

      res.status(200).json({
        success: true,
        message: "Workspace đã được xóa thành công",
      });
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    logger.error("Error deleting workspace:", error);
    next(error);
  }
};

/**
 * Lấy danh sách thành viên của workspace
 */
const getWorkspaceMembers = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Kiểm tra quyền truy cập (chỉ OWNER hoặc ADMIN)
    const adminCheckQuery = `
      SELECT * FROM workspace_members wm
      JOIN roles r ON wm.role_id = r.id
      WHERE wm.workspace_id = ? AND wm.user_id = ? AND r.name IN ('OWNER', 'ADMIN','MEMBER')
    `;
    const adminCheck = await executeQuery(adminCheckQuery, [id, userId]);

    if (adminCheck.length === 0) {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền truy cập danh sách thành viên workspace này",
      });
    }

    // Lấy danh sách thành viên
    const membersQuery = `
      SELECT u.id, u.email, u.full_name, u.avatar_binary, r.name as role
      FROM workspace_members wm
      JOIN users u ON wm.user_id = u.id
      JOIN roles r ON wm.role_id = r.id
      WHERE wm.workspace_id = ?
    `;
    const members = await executeQuery(membersQuery, [id]);

    res.status(200).json({
      success: true,
      count: members.length,
      data: members,
    });
  } catch (error) {
    logger.error("Error fetching workspace members:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy danh sách thành viên",
    });
  }
};

/**
 * Thêm thành viên vào workspace
 */
const addWorkspaceMember = async (req, res, next) => {
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

    const adminCheck = await executeQuery(adminCheckQuery, [id, userId]);

    if (adminCheck.length === 0) {
      return next(
        new ForbiddenError(
          "Bạn không có quyền thêm thành viên vào workspace này"
        )
      );
    }

    // Kiểm tra email có tồn tại trong hệ thống
    const userQuery = `SELECT id FROM users WHERE email = ?`;
    const users = await executeQuery(userQuery, [email]);

    if (users.length === 0) {
      return next(new BadRequestError("Người dùng không tồn tại"));
    }

    const newMemberId = users[0].id;

    // Kiểm tra người dùng đã là thành viên của workspace chưa
    const existingMemberQuery = `
      SELECT * FROM workspace_members
      WHERE workspace_id = ? AND user_id = ?
    `;

    const existingMember = await executeQuery(existingMemberQuery, [
      id,
      newMemberId,
    ]);

    if (existingMember.length > 0) {
      return next(
        new BadRequestError("Người dùng đã là thành viên của workspace")
      );
    }

    // Lấy role_id từ tên role
    const roleQuery = `SELECT id FROM roles WHERE name = ?`;
    const roles = await executeQuery(roleQuery, [role.toUpperCase()]);

    if (roles.length === 0) {
      return next(new BadRequestError("Vai trò không hợp lệ"));
    }

    const roleId = roles[0].id;

    // Tạo lời mời cho người dùng
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
      userId, // Thêm giá trị inviter_id
    ]);

    // TODO: Gửi email thông báo lời mời

    res.status(200).json({
      success: true,
      message: "Đã gửi lời mời cho thành viên mới",
      data: {
        invitationId,
        workspaceId: id,
        userId: newMemberId,
        role: role.toUpperCase(),
      },
    });
  } catch (error) {
    logger.error("Error adding workspace member:", error);
    next(error);
  }
};

/**
 * Cập nhật vai trò thành viên trong workspace
 */
const updateMemberRole = async (req, res, next) => {
  try {
    const { id, userId } = req.params;
    const { role } = req.body;
    const currentUserId = req.user.id;

    // Kiểm tra quyền quản trị workspace
    const adminCheckQuery = `
      SELECT * FROM workspace_members wm
      JOIN roles r ON wm.role_id = r.id
      WHERE wm.workspace_id = ? AND wm.user_id = ? AND r.name IN ('OWNER', 'ADMIN')
    `;

    const adminCheck = await executeQuery(adminCheckQuery, [id, currentUserId]);

    if (adminCheck.length === 0) {
      return next(
        new ForbiddenError(
          "Bạn không có quyền quản lý thành viên workspace này"
        )
      );
    }

    // Kiểm tra người dùng là thành viên của workspace
    const memberCheckQuery = `
      SELECT wm.*, r.name as role_name
      FROM workspace_members wm
      JOIN roles r ON wm.role_id = r.id
      WHERE wm.workspace_id = ? AND wm.user_id = ?
    `;

    const memberCheck = await executeQuery(memberCheckQuery, [id, userId]);

    if (memberCheck.length === 0) {
      return next(
        new BadRequestError("Người dùng không phải thành viên của workspace")
      );
    }

    // Không thể thay đổi vai trò của người sở hữu
    if (memberCheck[0].role_name === "OWNER") {
      return next(
        new ForbiddenError(
          "Không thể thay đổi vai trò của người sở hữu workspace"
        )
      );
    }

    // Chỉ OWNER mới có thể chỉ định ADMIN
    if (role.toUpperCase() === "ADMIN") {
      const ownerCheckQuery = `
        SELECT * FROM workspace_members wm
        JOIN roles r ON wm.role_id = r.id
        WHERE wm.workspace_id = ? AND wm.user_id = ? AND r.name = 'OWNER'
      `;

      const ownerCheck = await executeQuery(ownerCheckQuery, [
        id,
        currentUserId,
      ]);

      if (ownerCheck.length === 0) {
        return next(
          new ForbiddenError(
            "Chỉ người sở hữu mới có thể chỉ định người quản trị"
          )
        );
      }
    }

    // Lấy role_id từ tên role
    const roleQuery = `SELECT id FROM roles WHERE name = ?`;
    const roles = await executeQuery(roleQuery, [role.toUpperCase()]);

    if (roles.length === 0) {
      return next(new BadRequestError("Vai trò không hợp lệ"));
    }

    const roleId = roles[0].id;

    // Cập nhật vai trò
    const updateRoleQuery = `
      UPDATE workspace_members
      SET role_id = ?
      WHERE workspace_id = ? AND user_id = ?
    `;

    await executeQuery(updateRoleQuery, [roleId, id, userId]);

    res.status(200).json({
      success: true,
      message: "Đã cập nhật vai trò thành viên",
      data: {
        workspaceId: id,
        userId: userId,
        role: role.toUpperCase(),
      },
    });
  } catch (error) {
    logger.error("Error updating member role:", error);
    next(error);
  }
};

/**
 * Xóa thành viên khỏi workspace
 */
const removeMember = async (req, res, next) => {
  try {
    const { id, userId } = req.params;
    const currentUserId = req.user.id;

    // Không thể tự xóa mình khỏi workspace
    if (userId === currentUserId) {
      return next(
        new BadRequestError("Bạn không thể tự xóa mình khỏi workspace")
      );
    }

    // Kiểm tra quyền quản trị workspace
    const adminCheckQuery = `
      SELECT * FROM workspace_members wm
      JOIN roles r ON wm.role_id = r.id
      WHERE wm.workspace_id = ? AND wm.user_id = ? AND r.name IN ('OWNER', 'ADMIN')
    `;

    const adminCheck = await executeQuery(adminCheckQuery, [id, currentUserId]);

    if (adminCheck.length === 0) {
      return next(
        new ForbiddenError(
          "Bạn không có quyền xóa thành viên khỏi workspace này"
        )
      );
    }

    // Kiểm tra người dùng là thành viên của workspace
    const memberCheckQuery = `
      SELECT wm.*, r.name as role_name
      FROM workspace_members wm
      JOIN roles r ON wm.role_id = r.id
      WHERE wm.workspace_id = ? AND wm.user_id = ?
    `;

    const memberCheck = await executeQuery(memberCheckQuery, [id, userId]);

    if (memberCheck.length === 0) {
      return next(
        new BadRequestError("Người dùng không phải thành viên của workspace")
      );
    }

    // Không thể xóa người sở hữu
    if (memberCheck[0].role_name === "OWNER") {
      return next(
        new ForbiddenError("Không thể xóa người sở hữu khỏi workspace")
      );
    }

    // Nếu người hiện tại là ADMIN (không phải OWNER), họ không thể xóa ADMIN khác
    if (
      adminCheck[0].role_name === "ADMIN" &&
      memberCheck[0].role_name === "ADMIN"
    ) {
      return next(
        new ForbiddenError("Bạn không có quyền xóa người quản trị khác")
      );
    }

    // Xóa thành viên
    const deleteMemberQuery = `
      DELETE FROM workspace_members
      WHERE workspace_id = ? AND user_id = ?
    `;

    await executeQuery(deleteMemberQuery, [id, userId]);

    res.status(200).json({
      success: true,
      message: "Đã xóa thành viên khỏi workspace",
    });
  } catch (error) {
    logger.error("Error removing member:", error);
    next(error);
  }
};



module.exports = {
  getWorkspaces,
  createWorkspace,
  getWorkspaceById,
  updateWorkspace,
  deleteWorkspace,
  getWorkspaceMembers,
  addWorkspaceMember,
  updateMemberRole,
  removeMember,
  
};
