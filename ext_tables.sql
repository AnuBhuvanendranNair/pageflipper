CREATE TABLE tt_content (
	tx_pageflipper_files int(11) unsigned DEFAULT '0' NOT NULL,
	tx_pageflipper_layout varchar(20) DEFAULT 'covers' NOT NULL,
	tx_pageflipper_show_titles tinyint(1) unsigned DEFAULT '1' NOT NULL,
	tx_pageflipper_columns tinyint(1) unsigned DEFAULT '3' NOT NULL,
	tx_pageflipper_page_mode varchar(10) DEFAULT 'double' NOT NULL,
	tx_pageflipper_navigation tinyint(1) unsigned DEFAULT '1' NOT NULL,
	tx_pageflipper_fullscreen tinyint(1) unsigned DEFAULT '1' NOT NULL,
	tx_pageflipper_zoom tinyint(1) unsigned DEFAULT '1' NOT NULL,
	tx_pageflipper_download tinyint(1) unsigned DEFAULT '1' NOT NULL
);

CREATE TABLE sys_file_reference (
	tx_pageflipper_cover int(11) unsigned DEFAULT '0' NOT NULL
);
