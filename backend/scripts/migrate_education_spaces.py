"""默认只读盘点。演练/正式切换必须停机；正式切换另需确认映射摘要。"""
import argparse
import json
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from app.education.migration import inventory, map_digest, snapshot, rehearse, migrate_copy, verify_snapshot


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database',type=Path,required=True)
    parser.add_argument('--mode',choices=('inventory','rehearse','apply'),default='inventory')
    parser.add_argument('--mapping',type=Path)
    parser.add_argument('--backup-dir',type=Path)
    parser.add_argument('--destination',type=Path)
    parser.add_argument('--maintenance-stopped',action='store_true',help='确认前后端、任务工作器及其他写入者均已停止')
    parser.add_argument('--confirm-mapping-sha256',help='管理员核对实际归属后的映射 SHA256；不是自动推定归属')
    args=parser.parse_args()
    if args.mode=='inventory':
        print(json.dumps(inventory(args.database),ensure_ascii=False,indent=2)); return
    if not args.mapping or not args.backup_dir: parser.error('请指定归属映射与全新备份目录')
    if not args.maintenance_stopped: parser.error('必须先停机，不能在生产服务运行时备份或迁移')
    mapping=json.loads(args.mapping.read_text(encoding='utf-8-sig')); digest=map_digest(mapping)
    if args.mode=='apply' and args.confirm_mapping_sha256!=digest:
        parser.error('正式切换需要管理员核对映射并提供准确摘要：'+digest)
    if args.mode=='rehearse' and not args.destination: parser.error('请指定全新的演练目录')
    backup=snapshot(args.database,args.backup_dir,maintenance_confirmed=True)
    if args.mode=='rehearse': result=rehearse(backup,args.destination,mapping)
    else:
        verify_snapshot(backup)
        # 交付文件与不可变备份分开保存；已存在则拒绝，不覆盖邀请码。
        receipt=args.backup_dir.parent/(args.backup_dir.name+'-private-invitations.json')
        result=migrate_copy(args.database,mapping,receipt)
    print(json.dumps(result,ensure_ascii=False))


if __name__=='__main__': main()
