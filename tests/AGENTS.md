# Test maintenance

- 测试的组织、去重和按功能拆分由 agent 主动维护；用户不需要逐条审阅测试，也不需要另行提醒拆文件。维护限于当前任务相关测试，不借此修改业务行为。
- `api/test_posting_flow.py` 只保留完整导入、解析、建卡、读取的主流程；通用生命周期放 `api/test_posting_lifecycle.py`，字段更新放 `api/posting_cards/test_<feature>.py`。
- 一个文件围绕一个功能或紧密相关的行为；新增无关板块时新建对应文件，不继续堆进 flow。文件达到数百行时检查是否已有多个独立职责，不按每个用例机械拆文件。
- API 共用数据放 `api/factories.py`。用 `make_card_update_request(...)` 构造完整请求，只覆盖当前用例需要的字段；缺字段测试显式 `del`。每次返回独立可变对象，不共享会被测试修改的全局字典。
- 专属辅助函数和参数表留在所属功能文件；测试模块不要互相导入，不从生产更新函数推导预期结果，也不为去重隐藏关键断言。
- 结构拆分保留断言、参数化及所有用例；对比拆分前后收集清单，再跑回归。测试文件数量和行数不是覆盖率，不通过删断言、跳过用例或放宽预期来提速。
- 日常修改先跑相关功能文件；共享合同/helper 变化及收尾运行全套。没有前端改动就不重复前端构建；不引入测试框架/并行插件或浏览器操作，除非任务另有授权。
- 从仓库根目录运行：`.venv/bin/python -m pytest -q`；单个功能例如 `.venv/bin/python -m pytest tests/api/posting_cards/test_posting_info.py -q`。耗时用 `--durations=10` 查看，不把测试执行时间与 agent 阅读/修改时间混为一谈。
